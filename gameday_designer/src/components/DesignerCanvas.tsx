/**
 * DesignerCanvas Component
 *
 * Main container for the Gameday Designer that:
 * - Shows all fields in responsive columns
 * - Renders FieldColumn for each field
 * - Shows empty state message when no fields
 * - Can switch to results entry mode
 */

import React from 'react';
import { Row, Col, Alert, Button } from 'react-bootstrap';
import type { Field } from '../types/designer';
import FieldColumn from './FieldColumn';
import { GameResultsTable } from './GameResultsTable';
import { useGamedayContext } from '../context/GamedayContext';

export interface DesignerCanvasProps {
  /** All fields to display */
  fields: Field[];
  /** ID of the currently selected game slot (null if none) */
  selectedGameSlotId: string | null;
  /** Callback when field name is changed */
  onUpdateFieldName: (fieldId: string, name: string) => void;
  /** Callback when field is to be removed */
  onRemoveField: (fieldId: string) => void;
  /** Callback when Add Game button is clicked */
  onAddGameSlot: (fieldId: string) => void;
  /** Callback when a game slot is selected */
  onSelectGameSlot: (slotId: string) => void;
  /** Callback when a game slot is to be deleted */
  onDeleteGameSlot: (slotId: string) => void;
  /** Callback when a game slot is to be duplicated */
  onDuplicateGameSlot: (slotId: string) => void;
}

/**
 * DesignerCanvas component.
 * Main container that displays all fields in a responsive column layout.
 * Can switch to results entry mode to display GameResultsTable.
 */
const DesignerCanvas: React.FC<DesignerCanvasProps> = ({
  fields,
  selectedGameSlotId,
  onUpdateFieldName,
  onRemoveField,
  onAddGameSlot,
  onSelectGameSlot,
  onDeleteGameSlot,
  onDuplicateGameSlot,
}) => {
  const { resultsMode, setResultsMode, gameResults } = useGamedayContext();

  const handleToggleResultsMode = async () => {
    if (resultsMode) {
      setResultsMode(false);
    } else {
      // Load game results before switching
      await loadGameResults();
      setResultsMode(true);
    }
  };

  const loadGameResults = async () => {
    try {
      console.log('Loading game results...');
      // Extract gamedayId from URL or props
      const gamedayId = window.location.pathname.split('/').pop();
      if (!gamedayId) return;
      
      const response = await fetch(`/api/gamedays/${gamedayId}/games/`);
      if (response.ok) {
        const data = await response.json();
        setGameResults(data);
      }
    } catch (error) {
      console.error('Failed to load game results', error);
    }
  };

  const handleSaveResults = async (results: Record<string, any>) => {
    console.log('Saving game results:', results);
    
    // Group results by gameId
    const gamesToUpdate: Record<number, { halftime_score: { home: number; away: number }; final_score: { home: number; away: number } }> = {};
    
    // First, initialize structures for all games in the edits
    Object.keys(results).forEach(key => {
      const gameId = parseInt(key.split('-')[0]);
      if (!gamesToUpdate[gameId]) {
        // Find existing game data to preserve other half if only one was edited (though validation should prevent this)
        const game = gameResults.find(g => g.id === gameId);
        if (game) {
          const homeResult = game.results.find(r => r.isHome);
          const awayResult = game.results.find(r => !r.isHome);
          gamesToUpdate[gameId] = {
            halftime_score: { 
              home: homeResult?.fh ?? 0, 
              away: awayResult?.fh ?? 0 
            },
            final_score: { 
              home: (homeResult?.fh ?? 0) + (homeResult?.sh ?? 0), 
              away: (awayResult?.fh ?? 0) + (awayResult?.sh ?? 0) 
            }
          };
        }
      }
    });

    // Then, apply the edits
    Object.entries(results).forEach(([key, edit]) => {
      const gameId = parseInt(key.split('-')[0]);
      const update = gamesToUpdate[gameId];
      if (edit.isHome) {
        update.halftime_score.home = edit.fh;
        update.final_score.home = edit.fh + edit.sh;
      } else {
        update.halftime_score.away = edit.fh;
        update.final_score.away = edit.fh + edit.sh;
      }
    });

    try {
      const promises = Object.entries(gamesToUpdate).map(([gameId, data]) => 
        gamedayApi.updateGameResult(parseInt(gameId), data)
      );
      await Promise.all(promises);
      
      // Update local nodes in context to keep visual layout in sync
      Object.entries(gamesToUpdate).forEach(([gameId, data]) => {
        const stringId = `game-${gameId}`;
        const node = nodes.find(n => n.id === stringId);
        if (node) {
          onUpdateNode?.(stringId, {
            halftime_score: data.halftime_score,
            final_score: data.final_score,
            status: 'COMPLETED'
          });
        }
      });

      console.log('Successfully saved all game results and synced nodes');
      // Reload to show updated data
      await loadGameResults();
    } catch (error) {
      console.error('Failed to save some game results', error);
      throw error; // Re-throw to show error in UI
    }
  };

  // Show results entry mode
  if (resultsMode) {
    return (
      <div className="results-mode-container">
        <div className="mb-3">
          <Button onClick={handleToggleResultsMode} variant="secondary">
            Back to Designer
          </Button>
        </div>
        <GameResultsTable games={gameResults} onSave={handleSaveResults} />
      </div>
    );
  }

  // Show empty state when no fields
  if (fields.length === 0) {
    return (
      <Alert variant="info" className="text-center">
        <Alert.Heading>No fields yet</Alert.Heading>
        <p>Click "Add Field" in the toolbar to create your first playing field.</p>
      </Alert>
    );
  }

  // Sort fields by order
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="mb-3">
        <Button onClick={handleToggleResultsMode} variant="success">
          Enter Results
        </Button>
      </div>
      <Row className="g-3">
        {sortedFields.map((field) => (
          <Col
            key={field.id}
            xs={12}
            md={6}
            lg={fields.length <= 2 ? 6 : 4}
            xl={fields.length <= 3 ? 4 : 3}
          >
            <FieldColumn
              field={field}
              selectedGameSlotId={selectedGameSlotId}
              onUpdateFieldName={onUpdateFieldName}
              onRemoveField={onRemoveField}
              onAddGameSlot={onAddGameSlot}
              onSelectGameSlot={onSelectGameSlot}
              onDeleteGameSlot={onDeleteGameSlot}
              onDuplicateGameSlot={onDuplicateGameSlot}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default DesignerCanvas;
