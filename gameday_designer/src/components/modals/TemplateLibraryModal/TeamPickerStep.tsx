import React, { useState } from 'react';
import { Modal, Button, Badge } from 'react-bootstrap';
import { GlobalTeam } from '../../../types/flowchart';

interface TeamPickerStepProps {
  show: boolean;
  requiredTeams: number;
  availableTeams: GlobalTeam[];
  onConfirm: (selectedTeamIds: string[]) => void;
  onBack: () => void;
}

const TeamPickerStep: React.FC<TeamPickerStepProps> = ({
  show, requiredTeams, availableTeams, onConfirm, onBack,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleTeam = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const canConfirm = selectedIds.length >= requiredTeams;

  return (
    <Modal show={show} onHide={onBack} centered>
      <Modal.Header closeButton>
        <Modal.Title>Select Teams</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          {selectedIds.length} of {requiredTeams} required selected
        </p>
        <div className="d-flex flex-wrap gap-2">
          {availableTeams.map(team => (
            <Badge
              key={team.id}
              bg={selectedIds.includes(team.id) ? 'primary' : 'light'}
              text={selectedIds.includes(team.id) ? 'white' : 'dark'}
              style={{ cursor: 'pointer', fontSize: 13, padding: '6px 12px' }}
              onClick={() => toggleTeam(team.id)}
            >
              {team.label}
            </Badge>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onBack}>← Back</Button>
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={() => onConfirm(selectedIds.slice(0, requiredTeams))}
        >
          Apply to Gameday →
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TeamPickerStep;
