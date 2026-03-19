import { FlowState, GlobalTeam, FlowNode, GameNode, isGameNode, createGameNode, createGameToGameEdge, FlowEdge, GlobalTeamGroup } from '../types/flowchart';
import { isStaticReference, isWinnerReference, isLoserReference, isGroupTeamReference } from '../types/designer';
import { v4 as uuidv4 } from 'uuid';

export interface GenericTemplateSlot {
  field: number;
  slot_order: number;
  stage: string;
  stage_type: 'STANDARD' | 'RANKING';
  standing: string;
  home_group?: number;
  home_team?: number;
  home_reference?: string;
  away_group?: number;
  away_team?: number;
  away_reference?: string;
  official_group?: number;
  official_team?: number;
  official_reference?: string;
  break_after: number;
  update_rule?: {
    pre_finished: string;
    team_rules: Array<{
      role: 'home' | 'away' | 'official';
      standing: string;
      place: number;
    }>;
  };
}

export interface GenericTemplate {
  id?: number | string;
  name: string;
  description: string;
  num_teams: number;
  num_fields: number;
  num_groups: number;
  game_duration: number;
  sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL';
  slots: GenericTemplateSlot[];
  group_config?: Array<{ name: string, team_count: number }>;
}

export function genericizeFlowState(state: FlowState, name: string, description: string = '', sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL' = 'ASSOCIATION'): GenericTemplate {
  const groups = [...state.globalTeamGroups].sort((a, b) => a.order - b.order);
  const teamsInGroups = groups.map(group => 
    state.globalTeams.filter(t => t.groupId === group.id).sort((a, b) => a.order - b.order)
  );

  const resolveTeam = (teamId: string | null, dynamicRef: any) => {
    if (dynamicRef) {
      if (isWinnerReference(dynamicRef)) return { reference: `Winner ${dynamicRef.matchName}` };
      if (isLoserReference(dynamicRef)) return { reference: `Loser ${dynamicRef.matchName}` };
      if (isGroupTeamReference(dynamicRef)) return { group: dynamicRef.group, team: dynamicRef.team };
    }
    
    if (teamId) {
      const team = state.globalTeams.find(t => t.id === teamId);
      if (team && team.groupId) {
        const groupIdx = groups.findIndex(g => g.id === team.groupId);
        const teamIdx = teamsInGroups[groupIdx].findIndex(t => t.id === team.id);
        if (groupIdx !== -1 && teamIdx !== -1) {
          return { group: groupIdx, team: teamIdx };
        }
      }
    }
    return {};
  };

  const resolveOfficial = (official: any) => {
    if (!official) return {};
    if (official.type === 'static') {
        const team = state.globalTeams.find(t => t.label === official.name || t.id === official.name);
        if (team && team.groupId) {
            const groupIdx = groups.findIndex(g => g.id === team.groupId);
            const teamIdx = teamsInGroups[groupIdx].findIndex(t => t.id === team.id);
            if (groupIdx !== -1 && teamIdx !== -1) {
                return { group: groupIdx, team: teamIdx };
            }
        }
        return { reference: official.name };
    }
    if (official.type === 'winner') return { reference: `Winner ${official.matchName}` };
    if (official.type === 'loser') return { reference: `Loser ${official.matchName}` };
    return {};
  };

  const gameNodes = state.nodes.filter(isGameNode) as GameNode[];
  const slots: GenericTemplateSlot[] = gameNodes.map(node => {
    const home = resolveTeam(node.data.homeTeamId, node.data.homeTeamDynamic);
    const away = resolveTeam(node.data.awayTeamId, node.data.awayTeamDynamic);
    const official = resolveOfficial(node.data.official);

    return {
      field: 1, 
      slot_order: 1, 
      stage: node.data.stage,
      stage_type: node.data.stageType,
      standing: node.data.standing,
      home_group: home.group,
      home_team: home.team,
      home_reference: home.reference || '',
      away_group: away.group,
      away_team: away.team,
      away_reference: away.reference || '',
      official_group: official.group,
      official_team: official.team,
      official_reference: official.reference || '',
      break_after: node.data.breakAfter || 0,
    };
  });

  const fields = [...state.fields].sort((a, b) => a.order - b.order);
  slots.forEach(slot => {
      const node = gameNodes.find(n => n.data.standing === slot.standing && n.data.stage === slot.stage);
      if (node && node.parentId) {
          const stageNode = state.nodes.find(n => n.id === node.parentId);
          if (stageNode && stageNode.parentId) {
              const fieldNode = state.nodes.find(n => n.id === stageNode.parentId);
              if (fieldNode) {
                  const fieldIdx = fields.findIndex(f => f.id === fieldNode.id || f.id === fieldNode.data.name);
                  slot.field = fieldIdx !== -1 ? fieldIdx + 1 : 1;
              }
          }
      }
  });

  const sortedSlots = slots.sort((a, b) => {
      if (a.field !== b.field) return a.field - b.field;
      return a.standing.localeCompare(b.standing);
  });

  let currentField = -1;
  let currentOrder = 0;
  sortedSlots.forEach(slot => {
      if (slot.field !== currentField) {
          currentField = slot.field;
          currentOrder = 1;
      } else {
          currentOrder++;
      }
      slot.slot_order = currentOrder;
  });

  const group_config = groups.map((g, idx) => ({
    name: g.name,
    team_count: teamsInGroups[idx].length
  }));

  return {
    name,
    description,
    num_teams: state.globalTeams.length,
    num_fields: state.fields.length,
    num_groups: state.globalTeamGroups.length,
    game_duration: state.metadata?.game_duration || 70,
    sharing,
    slots: sortedSlots,
    group_config,
  };
}

/**
 * Apply a generic template to a gameday designer state.
 * Scaffolds teams and groups if missing.
 */
export function applyGenericTemplate(template: GenericTemplate, currentState: FlowState): { 
  nodes: FlowNode[], 
  edges: FlowEdge[], 
  globalTeams: GlobalTeam[], 
  globalTeamGroups: GlobalTeamGroup[] 
} {
  const newNodes: FlowNode[] = [];
  const newEdges: FlowEdge[] = [];
  let newGroups = [...currentState.globalTeamGroups];
  let newTeams = [...currentState.globalTeams];

  // 1. Scaffold groups if missing
  if (newGroups.length === 0 && template.group_config) {
    template.group_config.forEach((config, idx) => {
      newGroups.push({
        id: `g${idx + 1}`,
        name: config.name,
        order: idx
      });
    });
  } else if (newGroups.length < template.num_groups) {
    // Basic scaffolding if group_config is missing or partial
    for (let i = newGroups.length; i < template.num_groups; i++) {
      newGroups.push({
        id: `g${i + 1}`,
        name: `Gruppe ${String.fromCharCode(65 + i)}`,
        order: i
      });
    }
  }

  // Helper to get actual team ID from group/team index
  const getTeamId = (groupIdx: number | undefined, teamIdx: number | undefined): string | null => {
    if (groupIdx === undefined || teamIdx === undefined) return null;
    const group = newGroups[groupIdx];
    if (!group) return null;
    const teamsInGroup = newTeams.filter(t => t.groupId === group.id).sort((a, b) => a.order - b.order);
    return teamsInGroup[teamIdx]?.id || null;
  };

  // 2. Create Field and Stage nodes
  const fields: FlowNode[] = [];
  for (let i = 1; i <= template.num_fields; i++) {
    const fieldId = `field-${i}`;
    fields.push({
      id: fieldId,
      type: 'field',
      position: { x: (i - 1) * 400, y: 0 },
      data: { name: `Feld ${i}`, order: i - 1, color: '#007bff' }
    } as any);
  }
  newNodes.push(...fields);

  const stagesMap = new Map<string, string>(); // stage_name -> stage_id

  // 3. Create Game nodes
  template.slots.forEach((slot, idx) => {
    const fieldNode = fields[slot.field - 1] || fields[0];
    
    let stageId = stagesMap.get(slot.stage);
    if (!stageId) {
      stageId = `stage-${uuidv4().slice(0, 8)}`;
      stagesMap.set(slot.stage, stageId);
      newNodes.push({
        id: stageId,
        type: 'stage',
        parentId: fieldNode.id,
        position: { x: 20, y: 60 }, // Stacked logic simplified for now
        data: { name: slot.stage, order: stagesMap.size - 1, type: slot.stage_type }
      } as any);
    }

    const homeTeamId = getTeamId(slot.home_group, slot.home_team);
    const awayTeamId = getTeamId(slot.away_group, slot.away_team);

    const gameNode = createGameNode({
      id: `game-${uuidv4().slice(0, 8)}`,
      parentId: stageId,
      data: {
        stage: slot.stage,
        stageType: slot.stage_type,
        standing: slot.standing,
        homeTeamId: homeTeamId || undefined,
        awayTeamId: awayTeamId || undefined,
        homeTeamDynamic: slot.home_reference ? parseReference(slot.home_reference) : undefined,
        awayTeamDynamic: slot.away_reference ? parseReference(slot.away_reference) : undefined,
        breakAfter: slot.break_after,
      }
    });
    newNodes.push(gameNode);
  });

  return {
    nodes: newNodes,
    edges: newEdges, // Edges are derived from dynamic refs in list-based UI
    globalTeams: newTeams,
    globalTeamGroups: newGroups,
  };
}

function parseReference(ref: string) {
    if (ref.startsWith('Winner ')) return { type: 'winner', matchName: ref.replace('Winner ', '') };
    if (ref.startsWith('Loser ')) return { type: 'loser', matchName: ref.replace('Loser ', '') };
    return undefined;
}
