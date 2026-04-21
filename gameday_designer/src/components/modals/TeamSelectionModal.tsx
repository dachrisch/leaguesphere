import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Badge, Alert, Spinner } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import { designerApi } from '../../api/designerApi';
import { GlobalTeam } from '../../types/flowchart';
import { getTeamColor } from '../../utils/tournamentConstants';

export interface TeamSelectionModalProps {
  show: boolean;
  onHide: () => void;
  onSelect: (team: { id: number; text: string }) => void;
  onSelectMultiple?: (teams: { id: number; text: string }[]) => void;
  groupId: string;
  gamedayId: number;
  title?: string;
  allowMultiple?: boolean;
  requiredTeams?: number;
}

const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  show,
  onHide,
  onSelect,
  onSelectMultiple,
  gamedayId,
  title,
  allowMultiple = false,
  requiredTeams = 1,
}) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<GlobalTeam[]>([]);
  const [associationFilter, setAssociationFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch league teams when modal opens
  useEffect(() => {
    if (!show || !gamedayId) return;

    setLoading(true);
    designerApi.getLeagueTeams(gamedayId)
      .then(teams => {
        setAvailableTeams(
          teams.map((t, i) => ({
            id: String(t.id),
            label: t.name,
            groupId: null,
            order: i,
            color: getTeamColor(i),
            associationAbbr: t.association_abbr ?? null
          }))
        );
      })
      .catch(err => {
        console.error('Failed to load league teams:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [show, gamedayId]);

  // Reset state when hiding
  useEffect(() => {
    if (!show) {
      setSelectedIds([]);
      setSearchQuery('');
      setAssociationFilter('all');
    }
  }, [show]);

  const toggleTeam = (id: string) => {
    if (!allowMultiple) {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // Get unique associations from available teams
  const associations = Array.from(
    new Map(
      availableTeams
        .filter(t => t.associationAbbr)
        .map(t => [t.associationAbbr, t.associationAbbr])
    ).values()
  ).sort();

  // Filter teams by association/scope and search query
  const filteredTeams = availableTeams.filter(team => {
    const matchesSearch = searchQuery === '' || team.label.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (associationFilter === 'all') return true;
    return team.associationAbbr === associationFilter;
  });

  const handleConfirm = useCallback(() => {
    const selectedTeams = availableTeams.filter(t => selectedIds.includes(t.id));
    
    if (allowMultiple && onSelectMultiple) {
      onSelectMultiple(selectedTeams.map(t => ({ id: parseInt(t.id), text: t.label })));
    } else if (selectedTeams.length > 0) {
      onSelect({ id: parseInt(selectedTeams[0].id), text: selectedTeams[0].label });
    }
    
    onHide();
  }, [availableTeams, selectedIds, allowMultiple, onSelectMultiple, onSelect, onHide]);

  const canConfirm = allowMultiple 
    ? selectedIds.length >= requiredTeams
    : selectedIds.length === 1;

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title><i className="bi bi-people me-2"></i>{title || t('modal:teamSelection.title')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {allowMultiple && (
          <p className="text-muted small mb-3">
            Select at least <strong>{requiredTeams}</strong> teams.
            Currently selected: <Badge bg={canConfirm ? 'success' : 'warning'}>{selectedIds.length}</Badge>
          </p>
        )}

        <div className="mb-3">
          <input
            type="text"
            className="form-control form-control-sm mb-3"
            placeholder={t('ui:placeholder.searchGamedays')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={associationFilter === 'all' ? 'primary' : 'outline-primary'}
              onClick={() => setAssociationFilter('all')}
            >
              All Teams
            </Button>
            {associations.map(abbr => (
              <Button
                key={abbr}
                size="sm"
                variant={associationFilter === abbr ? 'primary' : 'outline-primary'}
                onClick={() => setAssociationFilter(abbr)}
              >
                {abbr}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" />
            <p className="mt-2 text-muted">{t('ui:message.loading')}</p>
          </div>
        ) : availableTeams.length === 0 ? (
          <Alert variant="info" className="py-2 small">
            {t('ui:message.noTeamsYet')}
          </Alert>
        ) : filteredTeams.length === 0 ? (
          <Alert variant="warning" className="py-2 small">
            No teams match your search or filter.
          </Alert>
        ) : (
          <div className="d-flex flex-wrap gap-2 mb-3" style={{ maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
            {filteredTeams.map(team => {
              const isSelected = selectedIds.includes(team.id);
              return (
                <Button
                  key={team.id}
                  size="sm"
                  variant={isSelected ? 'primary' : 'outline-primary'}
                  className="d-flex align-items-center gap-2"
                  style={{
                    fontSize: 13,
                    padding: '8px 14px',
                    transition: 'all 0.1s ease-in-out',
                    opacity: isSelected ? 1 : 0.7
                  }}
                  onClick={() => toggleTeam(team.id)}
                >
                  {isSelected && <i className="bi bi-check"></i>}
                  <span>{team.label}</span>
                </Button>
              );
            })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="outline-secondary" onClick={onHide}>
          {t('ui:button.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={handleConfirm}
          style={{ minWidth: '120px' }}
        >
          {allowMultiple ? t('ui:button.add') : t('ui:button.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TeamSelectionModal;
