import React, { useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import { gamedayApi } from '../../api/gamedayApi';
import TeamPickerStep from './TemplateLibraryModal/TeamPickerStep';
import type { GlobalTeam } from '../../types/flowchart';
import { getTeamColor } from '../../utils/tournamentConstants';

export interface TeamSelectionModalProps {
  show: boolean;
  onHide: () => void;
  onSelect: (teams: GlobalTeam[]) => void;
  groupId: string;
  title?: string;
}

const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  show,
  onHide,
  onSelect,
  title,
}) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  const [availableTeams, setAvailableTeams] = useState<GlobalTeam[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;

    const loadTeams = async () => {
      setLoading(true);
      try {
        const teams = await gamedayApi.getLeagueTeams(0); // Get all teams
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
  }, [show]);

  const handleConfirm = (selectedTeams: GlobalTeam[]) => {
    onSelect(selectedTeams);
    onHide();
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
        />
      )}
    </Modal>
  );
};

export default TeamSelectionModal;
