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
 *  1. Fetch the migration plan (GET /gamedays/:id/migration-plan/) and the
 *     gameday itself. Both are read-only -- nothing is written yet.
 *  2. Build the migrated Designer canvas in memory (seed a GlobalTeam[]/
 *     GlobalTeamGroup[] pool from the plan's team_mapping -- see buildSeedTeams
 *     below for the gap-filling rules this requires -- then hand that seed to
 *     the existing, already-tested applyGenericTemplate() to build nodes/edges;
 *     this component never builds flow nodes itself) and render it read-only in
 *     the background, so the user already sees exactly what would be saved.
 *  3. Show a confirmation dialog on top stating that no data will be changed
 *     but that from now on the gameday will be edited in the Designer.
 *  4. On confirm: PUT the in-memory state to the existing designer-state
 *     endpoint. On cancel: the preview is thrown away and nothing is written.
 *  5. Only once that PUT has succeeded, navigate to /designer/:id (carrying
 *     any plan warnings along for the destination to surface).
 *
 * Ordering is critical: this must never GET the designer-state endpoint (or
 * navigate anywhere that would) before its own PUT succeeds -- that GET does
 * a get_or_create server-side and would silently create a blank
 * GamedayDesignerState row ahead of this write. The background preview is
 * therefore seeded from the in-memory state directly, never from the API.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Container } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { gamedayApi } from '../../api/gamedayApi';
import { applyGenericTemplate, GenericTemplate } from '../../utils/templateMapper';
import { getTeamColor } from '../../utils/tournamentConstants';
import type { FlowState, GlobalTeam, GlobalTeamGroup } from '../../types/flowchart';
import type { Gameday, MigrationPlan } from '../../types';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import LoadingOverlay from '../ui/LoadingOverlay';
import MigrateConfirmModal from '../modals/MigrateConfirmModal';
import MigrateGamedayPreview from './MigrateGamedayPreview';

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
 *
 * Colors cycle through the same palette (getTeamColor, tournamentConstants.ts)
 * every other team-seeding path in this app uses (flowchartImport.ts's JSON
 * import, useTeamPoolState.ts, generateTeamsForTournament) -- a running index
 * across the whole pool, not reset per group. Without this every migrated
 * team falls back to useFlowState's flat gray default (`?? '#cccccc'`),
 * which is indistinguishable team-to-team on the canvas.
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
  let colorIndex = 0;
  globalTeamGroups.forEach((group, groupIdx) => {
    const maxTeamIdx = maxTeamIndexByGroup.get(groupIdx) ?? -1;
    for (let teamIdx = 0; teamIdx <= maxTeamIdx; teamIdx++) {
      const mapped = plan.team_mapping[`${groupIdx}_${teamIdx}`];
      globalTeams.push({
        id: uuidv4(),
        label: mapped ? mapped.label : 'TBD',
        color: getTeamColor(colorIndex++),
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
  const [previewState, setPreviewState] = useState<FlowState | null>(null);
  const [gameday, setGameday] = useState<Gameday | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!id || hasRunRef.current) return;
    hasRunRef.current = true;

    const gamedayId = parseInt(id, 10);

    (async () => {
      try {
        const [plan, fetchedGameday] = await Promise.all([
          gamedayApi.getMigrationPlan(gamedayId),
          // Best-effort only, for a friendlier template name and seed metadata --
          // this gameday's designer-relevant permissions were already verified
          // by the migration-plan call above, so a failure here must not block
          // the migration itself.
          gamedayApi.getGameday(gamedayId).catch(() => null),
        ]);

        const { globalTeams, globalTeamGroups } = buildSeedTeams(plan);

        const genericTemplate: GenericTemplate = {
          name: fetchedGameday?.name || t('ui:migration.defaultTemplateName'),
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
          update_rules: plan.update_rules,
        };

        const applied = applyGenericTemplate(genericTemplate, {
          nodes: [],
          edges: [],
          globalTeams,
          globalTeamGroups,
        });

        setGameday(fetchedGameday);
        setWarnings([...plan.warnings, ...applied.warnings]);
        setPreviewState({
          ...(fetchedGameday && {
            metadata: {
              id: fetchedGameday.id,
              name: fetchedGameday.name,
              date: fetchedGameday.date,
              start: fetchedGameday.start,
              format: fetchedGameday.format,
              author: fetchedGameday.author,
              address: fetchedGameday.address,
              season: fetchedGameday.season,
              league: fetchedGameday.league,
              status: fetchedGameday.status,
              has_results: fetchedGameday.has_results,
              resource_urls: fetchedGameday.resource_urls,
            },
          }),
          nodes: applied.nodes,
          edges: applied.edges,
          globalTeams: applied.globalTeams,
          globalTeamGroups: applied.globalTeamGroups,
        });
      } catch (error) {
        setErrorMessage(extractErrorDetail(error, t('ui:migration.loadPlanFailedFallback')));
      }
    })();
  }, [id, navigate, t]);

  const handleConfirm = async () => {
    if (!id || !previewState) return;
    setIsSaving(true);

    try {
      await gamedayApi.updateDesignerState(parseInt(id, 10), previewState);
    } catch {
      setIsSaving(false);
      setErrorMessage(t('ui:migration.saveFailed'));
      return;
    }

    navigate(`/designer/${id}`, {
      replace: true,
      state: warnings.length > 0 ? { migrationWarnings: warnings } : undefined,
    });
  };

  const handleCancel = () => {
    if (!id) return;
    // The legacy gameday page lives outside this app's basename
    // (/gamedays/gameday/design), so escape it with a full page navigation.
    window.location.href = `/gamedays/gameday/${id}/`;
  };

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

  return (
    <div className="position-relative h-100 d-flex flex-column">
      <div className="flex-grow-1 overflow-auto">
        {previewState && <MigrateGamedayPreview state={previewState} />}
        {previewState === null && <LoadingOverlay message={t('ui:migration.loading')} />}
      </div>
      {isSaving && <LoadingOverlay message={t('ui:migration.loading')} />}
      <MigrateConfirmModal
        show={previewState !== null && !isSaving}
        onHide={handleCancel}
        onConfirm={handleConfirm}
        gamedayName={gameday?.name}
        warnings={warnings}
      />
    </div>
  );
};

export default MigrateGamedayRunner;
