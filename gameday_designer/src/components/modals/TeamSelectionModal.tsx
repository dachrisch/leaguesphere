import React, { useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import { gamedayApi } from '../../api/gamedayApi';
import TeamPickerStep from './TemplateLibraryModal/TeamPickerStep';
import type { GlobalTeam } from '../../types/flowchart';
import { getTeamColor } from '../../utils/tournamentConstants';
import { v4 as uuidv4 } from 'uuid';

export interface TeamSelectionModalProps {
  show: boolean;
  onHide: () => void;
  onSelect: (teams: GlobalTeam[]) => void;
  groupId: string;
  title?: string;
  gamedayId?: number;
}

const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  show,
  onHide,
  onSelect,
  title,
  gamedayId = 0,
}) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  const [availableTeams, setAvailableTeams] = useState<GlobalTeam[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;

    const loadTeams = async () => {
      setLoading(true);
      try {
        const teams = await gamedayApi.getLeagueTeams(gamedayId);
        const globalTeams = teams.map((t, i) => ({
          id: String(t.id),
          label: t.name,
          groupId: null,
          order: i,
          color: getTeamColor(i),
          associationAbbr: t.association_abbr ?? null
        }));
        setAvailableTeams(globalTeams);
      } catch (error) {
        console.error('Failed to load teams:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTeams();
  }, [show, gamedayId]);

  const handleConfirm = (selectedTeams: GlobalTeam[]) => {
    onSelect(selectedTeams);
    onHide();
  };

  const handleAutoGenerateTeams = async (count: number): Promise<GlobalTeam[]> => {
    const generated: GlobalTeam[] = [];
    for (let i = 0; i < count; i++) {
      const team: GlobalTeam = {
        id: `team-${uuidv4()}`,
        label: `Generated Team ${i + 1}`,
        groupId: null,
        order: availableTeams.length + i,
        color: getTeamColor((availableTeams.length + i) % 10),
      };
      generated.push(team);
    }
    return generated;
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      {loading ? (
        <>
          <Modal.Header closeButton>
            <Modal.Title>{title || t('modal:teamSelection.title', 'Add Teams to Pool')}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center py-5">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading teams...</span>
            </div>
          </Modal.Body>
        </>
      ) : (
        <TeamPickerStep
          requiredTeams={1}
          availableTeams={availableTeams}
          onConfirm={handleConfirm}
          onBack={onHide}
          onAutoGenerateTeams={handleAutoGenerateTeams}
        />
      )}
    </Modal>
  );
};

export default TeamSelectionModal;
