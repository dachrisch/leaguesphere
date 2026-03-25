import React, { useState, useCallback } from 'react';
import { Modal, Button, Form, InputGroup } from 'react-bootstrap';
import TemplateList, { SelectedTemplate } from './TemplateLibraryModal/TemplateList';
import TemplatePreview, { TournamentConfig } from './TemplateLibraryModal/TemplatePreview';
import SaveTemplateSheet from './TemplateLibraryModal/SaveTemplateSheet';
import TeamPickerStep from './TemplateLibraryModal/TeamPickerStep';
import { designerApi } from '../../api/designerApi';
import { GlobalTeam } from '../../types/flowchart';
import { ScheduleTemplate } from '../../types/api';
import { TournamentTemplate } from '../../utils/tournamentTemplates';
import { NotificationType } from '../../types/designer';

type FilterScope = 'all' | 'personal' | 'association' | 'global';
type Step = 'library' | 'team-picker';

const PILLS: { scope: FilterScope; label: string }[] = [
  { scope: 'all', label: 'All' },
  { scope: 'personal', label: '🔒 My templates' },
  { scope: 'association', label: '🏛️ Association' },
  { scope: 'global', label: '🌐 Community' },
];

interface TemplateLibraryModalProps {
  show: boolean;
  onHide: () => void;
  gamedayId: number;
  currentUserId: number;
  flowTeams: GlobalTeam[];
  onScheduleApplied?: () => void;
  onGenerateFromBuiltin?: (config: {
    templateId: string;
    fieldCount: number;
    startTime: string;
    gameDuration: number;
    breakDuration: number;
    selectedTeamIds: string[];
    generateTeams?: boolean;
  }) => void;
  getCurrentScheduleData?: () => { num_teams: number; num_fields: number; num_groups: number; game_duration: number };
  onNotify?: (message: string, type: NotificationType, title?: string) => void;
}

const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  show, onHide, gamedayId, currentUserId, flowTeams, onScheduleApplied,
  onGenerateFromBuiltin, getCurrentScheduleData, onNotify,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScope, setFilterScope] = useState<FilterScope>('all');
  const [step, setStep] = useState<Step>('library');
  const [showSave, setShowSave] = useState(false);
  const [applyConfig, setApplyConfig] = useState<TournamentConfig | undefined>();

  const handleSelect = useCallback((item: SelectedTemplate) => {
    const id = item.type === 'builtin'
      ? `builtin-${(item.template as TournamentTemplate).id}`
      : `saved-${(item.template as ScheduleTemplate).id}`;
    setSelectedId(id);
    setSelected(item);
  }, []);

  const handleApply = useCallback((item: SelectedTemplate, config?: TournamentConfig) => {
    setApplyConfig(config);
    // Built-in template with no teams: auto-generate teams, skip team picker
    if (item.type === 'builtin' && flowTeams.length === 0) {
      const builtin = item.template as TournamentTemplate;
      onGenerateFromBuiltin?.({
        templateId: builtin.id,
        fieldCount: builtin.fieldOptions[0] ?? 2,
        startTime: config?.startTime ?? '09:00',
        gameDuration: config?.gameDuration ?? 15,
        breakDuration: config?.breakDuration ?? 5,
        selectedTeamIds: [],
        generateTeams: true,
      });
      onHide();
      return;
    }
    setStep('team-picker');
  }, [flowTeams.length, onGenerateFromBuiltin, onHide]);

  const handleTeamConfirm = useCallback(async (teamIds: string[]) => {
    if (!selected) return;
    try {
      if (selected.type === 'builtin') {
        const builtin = selected.template as TournamentTemplate;
        onGenerateFromBuiltin?.({
          templateId: builtin.id,
          fieldCount: builtin.fieldOptions[0] ?? 2,
          startTime: applyConfig?.startTime ?? '09:00',
          gameDuration: applyConfig?.gameDuration ?? 15,
          breakDuration: applyConfig?.breakDuration ?? 5,
          selectedTeamIds: teamIds,
        });
        onHide();
        return;
      }
      const template = selected.template as ScheduleTemplate;
      const team_mapping: Record<string, number> = {};
      teamIds.forEach((teamId, i) => { team_mapping[String(i)] = parseInt(teamId, 10); });
      await designerApi.applyTemplate(template.id, { gameday_id: gamedayId, team_mapping });
      onScheduleApplied?.();
      onHide();
    } catch (e) {
      console.error('Failed to apply template', e);
    }
  }, [selected, applyConfig, gamedayId, onHide, onScheduleApplied, onGenerateFromBuiltin]);

  const handleClone = useCallback(async (item: SelectedTemplate) => {
    const srcName = item.type === 'builtin'
      ? (item.template as TournamentTemplate).name
      : (item.template as ScheduleTemplate).name;
    const promptedName = window.prompt('Clone name:', `Copy of ${srcName}`);
    if (!promptedName) return;

    if (item.type === 'saved') {
      await designerApi.cloneTemplate((item.template as ScheduleTemplate).id, { new_name: promptedName });
    } else {
      const builtin = item.template as TournamentTemplate;
      const schedData = getCurrentScheduleData?.() ?? { num_teams: builtin.teamCount.min, num_fields: 2, num_groups: 1, game_duration: 15 };
      await designerApi.createTemplate({
        name: promptedName,
        description: `Clone of built-in: ${builtin.name}`,
        sharing: 'PRIVATE',
        num_teams: builtin.teamCount.min,
        num_fields: builtin.fieldOptions[0] ?? 2,
        num_groups: schedData.num_groups,
        game_duration: schedData.game_duration,
      });
    }
    // Trigger re-fetch by toggling search query
    setSearchQuery(q => q + '\u200b');
    setTimeout(() => setSearchQuery(q => q.replace('\u200b', '')), 100);
  }, [getCurrentScheduleData]);

  const handleDelete = useCallback(async (template: ScheduleTemplate) => {
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    await designerApi.deleteTemplate(template.id);
    setSelected(null);
    setSelectedId(null);
    setSearchQuery(q => q + ' ');
    setTimeout(() => setSearchQuery(q => q.trim()), 100);
  }, []);

  const handleSave = useCallback(async (data: { name: string; description: string; sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL' }) => {
    const schedData = getCurrentScheduleData?.() ?? { num_teams: 0, num_fields: 0, num_groups: 0, game_duration: 0 };
    await designerApi.createTemplate({
      name: data.name,
      description: data.description,
      sharing: data.sharing,
      num_teams: schedData.num_teams,
      num_fields: schedData.num_fields,
      num_groups: schedData.num_groups,
      game_duration: schedData.game_duration,
    });
    setShowSave(false);
    onNotify?.('Template saved successfully', 'success');
    setSearchQuery(q => q + '\u200b');
    setTimeout(() => setSearchQuery(q => q.replace('\u200b', '')), 100);
  }, [getCurrentScheduleData, onNotify]);

  const requiredTeams = selected?.type === 'builtin'
    ? (selected.template as TournamentTemplate).teamCount.min
    : (selected?.template as ScheduleTemplate)?.num_teams ?? 0;

  return (
    <>
      <Modal show={show && step === 'library'} onHide={onHide} size="xl" fullscreen="lg-down">
        <Modal.Header className="bg-dark text-white">
          <Modal.Title>📚 Template Library</Modal.Title>
          <div className="ms-auto d-flex gap-2 align-items-center">
            <Button size="sm" variant="success" onClick={() => setShowSave(true)}>
              💾 Save current as template
            </Button>
            <Button size="sm" variant="outline-light" onClick={onHide}>✕</Button>
          </div>
        </Modal.Header>

        <div className="p-2 border-bottom bg-light d-flex flex-wrap gap-2 align-items-center">
          <InputGroup size="sm" style={{ maxWidth: 260 }}>
            <InputGroup.Text>🔍</InputGroup.Text>
            <Form.Control
              placeholder="Search templates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          {PILLS.map(pill => (
            <Button
              key={pill.scope}
              size="sm"
              variant={filterScope === pill.scope ? 'primary' : 'outline-secondary'}
              className="rounded-pill"
              onClick={() => setFilterScope(pill.scope)}
            >
              {pill.label}
            </Button>
          ))}
        </div>

        <Modal.Body className="p-0 d-flex" style={{ height: '60vh' }}>
          <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #dee2e6' }}>
            <TemplateList
              selectedId={selectedId}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              filterScope={filterScope}
            />
          </div>
          <div className="flex-grow-1">
            <TemplatePreview
              selected={selected}
              currentUserId={currentUserId}
              onApply={handleApply}
              onClone={handleClone}
              onDelete={handleDelete}
              onSave={() => setShowSave(true)}
            />
          </div>
        </Modal.Body>
      </Modal>

      <TeamPickerStep
        show={show && step === 'team-picker'}
        requiredTeams={requiredTeams}
        availableTeams={flowTeams}
        onConfirm={handleTeamConfirm}
        onBack={() => setStep('library')}
      />

      <SaveTemplateSheet
        show={showSave}
        onHide={() => setShowSave(false)}
        onSave={handleSave}
      />
    </>
  );
};

export default TemplateLibraryModal;
