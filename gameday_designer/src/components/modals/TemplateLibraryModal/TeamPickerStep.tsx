import React, { useState } from 'react';
import { Modal, Button, Badge, Form } from 'react-bootstrap';
import { GlobalTeam } from '../../../types/flowchart';

interface TeamPickerStepProps {
  show: boolean;
  requiredTeams: number;
  availableTeams: GlobalTeam[];
  onConfirm: (selectedTeamIds: string[]) => void;
  onBack: () => void;
  onCreateTeam?: (name: string) => Promise<GlobalTeam>;
  onAutoGenerateTeams?: (count: number) => Promise<GlobalTeam[]>;
}

const TeamPickerStep: React.FC<TeamPickerStepProps> = ({
  show, requiredTeams, availableTeams, onConfirm, onBack,
  onCreateTeam, onAutoGenerateTeams,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [localTeams, setLocalTeams] = useState<GlobalTeam[]>([]);

  const allTeams = [...availableTeams, ...localTeams];

  const toggleTeam = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const canConfirm = selectedIds.length >= requiredTeams;

  const handleAddTeam = async () => {
    if (!onCreateTeam || !newTeamName.trim()) return;
    setCreating(true);
    try {
      const team = await onCreateTeam(newTeamName.trim());
      setLocalTeams(prev => [...prev, team]);
      setSelectedIds(prev => [...prev, team.id]);
      setNewTeamName('');
    } finally {
      setCreating(false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!onAutoGenerateTeams) return;
    const count = requiredTeams - selectedIds.length;
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
    <Modal show={show} onHide={onBack} centered>
      <Modal.Header closeButton>
        <Modal.Title>Select Teams</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          {selectedIds.length} of {requiredTeams} required selected
        </p>
        <div className="d-flex flex-wrap gap-2">
          {allTeams.map(team => (
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

        {onCreateTeam && (
          <div className="mt-3 d-flex gap-2">
            <Form.Control
              size="sm"
              placeholder="New team name..."
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newTeamName.trim()) handleAddTeam(); }}
              disabled={creating}
            />
            <Button
              size="sm"
              variant="outline-primary"
              disabled={creating || !newTeamName.trim()}
              onClick={handleAddTeam}
            >
              {creating ? '...' : 'Add'}
            </Button>
          </div>
        )}

        {onAutoGenerateTeams && selectedIds.length < requiredTeams && (
          <Button
            size="sm"
            variant="outline-secondary"
            className="mt-2"
            disabled={creating}
            onClick={handleAutoGenerate}
          >
            {creating ? '...' : `Auto-generate ${requiredTeams - selectedIds.length} teams`}
          </Button>
        )}
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
