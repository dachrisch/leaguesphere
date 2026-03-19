import { FlowState, GlobalTeam, FlowNode, GameNode, isGameNode } from '../types/flowchart';
import { isStaticReference, isWinnerReference, isLoserReference, isGroupTeamReference } from '../types/designer';

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
  name: string;
  description: string;
  num_teams: number;
  num_fields: number;
  num_groups: number;
  game_duration: number;
  sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL';
  slots: GenericTemplateSlot[];
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
      field: 1, // Default field, will be updated based on parent if needed
      slot_order: 1, // Will be updated by caller or by sorting
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

  // Assign fields and slot orders
  const fields = [...state.fields].sort((a, b) => a.order - b.order);
  slots.forEach(slot => {
      const node = gameNodes.find(n => n.data.standing === slot.standing && n.data.stage === slot.stage);
      if (node && node.parentId) {
          // Find stage node
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

  // Sort slots by field and time to assign slot_order
  const sortedSlots = slots.sort((a, b) => {
      if (a.field !== b.field) return a.field - b.field;
      return a.standing.localeCompare(b.standing); // Fallback sort
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

  return {
    name,
    description,
    num_teams: state.globalTeams.length,
    num_fields: state.fields.length,
    num_groups: state.globalTeamGroups.length,
    game_duration: state.metadata?.game_duration || 70,
    sharing,
    slots: sortedSlots,
  };
}
