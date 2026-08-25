/**
 * MigrateGamedayRunner
 *
 * Route target for `/migrate/:id`. Turns an existing, legacy (pre-Designer)
 * gameday's real schedule into a Designer canvas, non-destructively -- it
 * never touches the real Gameinfo/Gameresult rows, it only reads a
 * server-computed "migration plan" and writes a brand new
 * GamedayDesignerState for the same gameday.
 *
 * Flow:
 *  1. Fetch the migration plan (GET /gamedays/:id/migration-plan/).
 *  2. Seed a GlobalTeam[]/GlobalTeamGroup[] pool from the plan's team_mapping
 *     (see buildSeedTeams below for the gap-filling rules this requires).
 *  3. Hand that seed to the existing, already-tested applyGenericTemplate()
 *     to build nodes/edges -- this component never builds flow nodes itself.
 *  4. PUT the result to the existing designer-state endpoint.
 *  5. Only once that PUT has succeeded, navigate to /designer/:id (carrying
 *     any plan warnings along for the destination to surface).
 *
 * Ordering is critical: this must never GET the designer-state endpoint (or
 * navigate anywhere that would) before its own PUT succeeds -- that GET does
 * a get_or_create server-side and would silently create a blank
 * GamedayDesignerState row ahead of this write.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Container } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { gamedayApi } from '../../api/gamedayApi';
import { applyGenericTemplate, GenericTemplate } from '../../utils/templateMapper';
import type { FlowState, GlobalTeam, GlobalTeamGroup } from '../../types/flowchart';
import type { MigrationPlan } from '../../types';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import LoadingOverlay from '../ui/LoadingOverlay';

/**
 * Pull a DRF-style `{ detail: "..." }` message out of a failed axios
 * request. Falls back to `fallback` when the response has no such field
 * (network failure, 500, etc.) -- mirrors the extraction pattern used by
 * GamedayMetadataAccordion for save errors.
 */
function extractErrorDetail(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/**
 * Build the GlobalTeam[]/GlobalTeamGroup[] seed for a migration plan.
 *
 * Groups are built directly from plan.group_config, in array order, so a
 * group's array index matches what applyGenericTemplate's internal
 * getTeamId(groupIdx, teamIdx) expects -- it looks groups up by raw array
 * position (`newGroups[groupIdx]`), not by matching an id.
 *
 * For each group, the GlobalTeam[] array is built to length
 * `(highest team index referenced for that group across team_mapping) + 1`,
 * with a real team (exact `label` from team_mapping, verbatim -- publish-time
 * team resolution matches by exact name string) at every index team_mapping
 * has an entry for, and a placeholder "TBD" team at every gap. This is
 * required because group_config[g].team_count only counts *distinct*
 * indices found; it does not guarantee they're contiguous from 0. Building a
 * compacted 0..count-1 array instead would silently misalign every team
 * after the first gap, since applyGenericTemplate's getTeamId resolves a
 * team by *array position after sorting by order*, not by the index value
 * itself.
 */
function buildSeedTeams(plan: MigrationPlan): {
  globalTeams: GlobalTeam[];
  globalTeamGroups: GlobalTeamGroup[];
} {
  const globalTeamGroups: GlobalTeamGroup[] = plan.group_config.map((group, idx) => ({
    id: `g${idx + 1}`,
    name: group.name,
    order: idx,
  }));

  const maxTeamIndexByGroup = new Map<number, number>();
  for (const key of Object.keys(plan.team_mapping)) {
    const [groupStr, teamStr] = key.split('_');
    const groupIdx = Number(groupStr);
    const teamIdx = Number(teamStr);
    if (teamIdx > (maxTeamIndexByGroup.get(groupIdx) ?? -1)) {
      maxTeamIndexByGroup.set(groupIdx, teamIdx);
    }
  }

  const globalTeams: GlobalTeam[] = [];
  globalTeamGroups.forEach((group, groupIdx) => {
    const maxTeamIdx = maxTeamIndexByGroup.get(groupIdx) ?? -1;
    for (let teamIdx = 0; teamIdx <= maxTeamIdx; teamIdx++) {
      const mapped = plan.team_mapping[`${groupIdx}_${teamIdx}`];
      globalTeams.push({
        id: uuidv4(),
        label: mapped ? mapped.label : 'TBD',
        groupId: group.id,
        order: teamIdx,
      });
    }
  });

  return { globalTeams, globalTeamGroups };
}

const MigrateGamedayRunner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTypedTranslation(['ui']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!id || hasRunRef.current) return;
    hasRunRef.current = true;

    const gamedayId = parseInt(id, 10);

    (async () => {
      let plan: MigrationPlan;
      try {
        plan = await gamedayApi.getMigrationPlan(gamedayId);
      } catch (error) {
        setErrorMessage(extractErrorDetail(error, t('ui:migration.loadPlanFailedFallback')));
        return;
      }

      // Best-effort only, for a friendlier template name and seed metadata --
      // this gameday's designer-relevant permissions were already verified
      // by the migration-plan call above, so a failure here must not block
      // the migration itself.
      const gameday = await gamedayApi.getGameday(gamedayId).catch(() => null);

      const { globalTeams, globalTeamGroups } = buildSeedTeams(plan);

      const genericTemplate: GenericTemplate = {
        name: gameday?.name || t('ui:migration.defaultTemplateName'),
        description: '',
        // Not persisted anywhere -- applyGenericTemplate is used purely as a
        // transient converter here, no ScheduleTemplate row is ever saved
        // from this flow. Distinct (group, team) pairs actually resolved.
        num_teams: Object.keys(plan.team_mapping).length,
        num_fields: plan.num_fields,
        num_groups: plan.num_groups,
        game_duration: 70,
        sharing: 'PRIVATE',
        slots: plan.slots,
        group_config: plan.group_config,
      };

      const seedState: FlowState = {
        nodes: [],
        edges: [],
        globalTeams,
        globalTeamGroups,
      };

      const applied = applyGenericTemplate(genericTemplate, seedState);

      const finalState: FlowState = {
        ...(gameday && {
          metadata: {
            id: gameday.id,
            name: gameday.name,
            date: gameday.date,
            start: gameday.start,
            format: gameday.format,
            author: gameday.author,
            address: gameday.address,
            season: gameday.season,
            league: gameday.league,
            status: gameday.status,
            has_results: gameday.has_results,
            resource_urls: gameday.resource_urls,
          },
        }),
        nodes: applied.nodes,
        edges: applied.edges,
        globalTeams: applied.globalTeams,
        globalTeamGroups: applied.globalTeamGroups,
      };

      try {
        await gamedayApi.updateDesignerState(gamedayId, finalState);
      } catch {
        setErrorMessage(t('ui:migration.saveFailed'));
        return;
      }

      navigate(`/designer/${id}`, {
        replace: true,
        state: plan.warnings.length > 0 ? { migrationWarnings: plan.warnings } : undefined,
      });
    })();
  }, [id, navigate, t]);

  if (!id || errorMessage) {
    return (
      <Container className="py-5">
        <Alert variant="danger">
          <Alert.Heading className="h5">{t('ui:migration.errorTitle')}</Alert.Heading>
          <p className="mb-0">{errorMessage || t('ui:error.gamedayNotFound')}</p>
        </Alert>
        {id && (
          <a href={`/gamedays/gameday/${id}/`} className="btn btn-secondary">
            {t('ui:migration.backToGameday')}
          </a>
        )}
      </Container>
    );
  }

  return <LoadingOverlay message={t('ui:migration.loading')} />;
};

export default MigrateGamedayRunner;
