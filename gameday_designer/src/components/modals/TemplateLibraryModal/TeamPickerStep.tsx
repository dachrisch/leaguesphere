import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Badge, Alert } from 'react-bootstrap';
import { GlobalTeam } from '../../../types/flowchart';

interface TeamPickerStepProps {
  requiredTeams: number;
  availableTeams: GlobalTeam[];
  onConfirm: (selectedTeams: GlobalTeam[]) => void;
  onBack: () => void;
  onAutoGenerateTeams?: (count: number) => Promise<GlobalTeam[]>;
}

const TeamPickerStep: React.FC<TeamPickerStepProps> = ({
  requiredTeams, availableTeams, onConfirm, onBack,
  onAutoGenerateTeams,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [localTeams, setLocalTeams] = useState<GlobalTeam[]>([]);
  const [selectedAssociation, setSelectedAssociation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const hasInitializedRef = useRef(false);

  // Auto-select league teams by default if they are available
  useEffect(() => {
    if (availableTeams.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setSelectedIds(availableTeams.slice(0, requiredTeams).map(t => t.id));
    }
  }, [availableTeams, requiredTeams]);

  const allTeams = [...availableTeams, ...localTeams];

  // Get unique associations from available teams
  const associations = Array.from(
    new Map(
      availableTeams
        .filter(t => t.associationAbbr)
        .map(t => [t.associationAbbr, t.associationAbbr])
    ).values()
  ).sort();

  // Filter teams by association and search query
  const filteredTeams = allTeams.filter(team => {
    const matchesAssociation = !selectedAssociation || team.associationAbbr === selectedAssociation;
    const matchesSearch = searchQuery === '' || team.label.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAssociation && matchesSearch;
  });

  const toggleTeam = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const canConfirm = selectedIds.length >= requiredTeams;

  const handleAutoGenerate = async () => {
    if (!onAutoGenerateTeams) return;
    const count = requiredTeams - selectedIds.length;
    if (count <= 0) return;
    setCreating(true);
    try {
      const teams = await onAutoGenerateTeams(count);
      setLocalTeams(prev => [...prev, ...teams]);
      setSelectedIds(prev => [...prev, ...teams.map(t => t.id)]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Modal.Header closeButton>
        <Modal.Title>Select Teams</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Select at least <strong>{requiredTeams}</strong> teams to apply this template.
          Currently selected: <Badge bg={canConfirm ? 'success' : 'warning'}>{selectedIds.length}</Badge>
        </p>

        <div className="mb-3">
          <input
            type="text"
            className="form-control form-control-sm mb-2"
            placeholder="🔍 Search teams..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="d-flex flex-wrap gap-1">
            <Badge
              bg={selectedAssociation === null ? 'primary' : 'secondary'}
              style={{ cursor: 'pointer', padding: '6px 10px' }}
              onClick={() => setSelectedAssociation(null)}
            >
              All
            </Badge>
            {associations.map(abbr => (
              <Badge
                key={abbr}
                bg={selectedAssociation === abbr ? 'primary' : 'secondary'}
                style={{ cursor: 'pointer', padding: '6px 10px' }}
                onClick={() => setSelectedAssociation(abbr)}
              >
                {abbr}
              </Badge>
            ))}
          </div>
        </div>

        {allTeams.length === 0 && !creating ? (
          <Alert variant="info" className="py-2 small">
            No league teams found. Use "Auto-generate" to create placeholders.
          </Alert>
        ) : filteredTeams.length === 0 ? (
          <Alert variant="warning" className="py-2 small">
            No teams match your search or filter.
          </Alert>
        ) : (
          <div className="d-flex flex-wrap gap-2 mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {filteredTeams.map(team => {
              const isSelected = selectedIds.includes(team.id);
              const isLocal = localTeams.some(lt => lt.id === team.id);
              return (
                <Badge
                  key={team.id}
                  bg={isSelected ? 'primary' : 'light'}
                  text={isSelected ? 'white' : 'dark'}
                  border={isSelected ? undefined : 'secondary'}
                  className={`border ${isSelected ? '' : 'text-secondary'}`}
                  style={{
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '8px 14px',
                    transition: 'all 0.1s ease-in-out',
                    opacity: isSelected ? 1 : 0.8
                  }}
                  onClick={() => toggleTeam(team.id)}
                >
                  {isLocal && '✨ '}{team.label}
                </Badge>
              );
            })}
          </div>
        )}

        {onAutoGenerateTeams && selectedIds.length < requiredTeams && (
          <Button
            size="sm"
            variant="outline-primary"
            className="w-100"
            disabled={creating}
            onClick={handleAutoGenerate}
          >
            {creating ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generating...</>
            ) : (
              `Auto-generate ${requiredTeams - selectedIds.length} missing teams`
            )}
          </Button>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="outline-secondary" onClick={onBack}>← Back to Library</Button>
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={() => {
            const teamMap = new Map(allTeams.map(t => [t.id, t]));
            const selectedTeams = selectedIds.slice(0, requiredTeams)
              .map(id => teamMap.get(id))
              .filter(Boolean) as GlobalTeam[];
            onConfirm(selectedTeams);
          }}
          style={{ minWidth: '150px' }}
        >
          Apply to Gameday →
        </Button>
      </Modal.Footer>
    </>
  );
};

export default TeamPickerStep;
