/**
 * WaitingOverlay React Component
 * Displays waiting states during draft synchronization and deck submission
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  WaitingOverlayState,
  PlayerWaitingStatus,
  WaitingProgress,
  AccessibilityAnnouncement
} from '@/lib/draft/waiting/types';

interface WaitingOverlayProps {
  waitingState: WaitingOverlayState | null;
  onCancel?: () => void;
  onDismiss?: () => void;
  className?: string;
}

interface PlayerStatusItemProps {
  player: PlayerWaitingStatus;
  showProgress?: boolean;
}

interface ProgressBarProps {
  progress: WaitingProgress;
  showIndeterminate?: boolean;
}

interface TimerDisplayProps {
  timeRemaining: number;
  hasTimeout: boolean;
  isUrgent?: boolean;
}

/**
 * Player status item component
 */
const PlayerStatusItem: React.FC<PlayerStatusItemProps> = ({ player, showProgress = false }) => {
  const getStatusText = (status: PlayerWaitingStatus['status']): string => {
    switch (status) {
      case 'waiting': return 'Waiting';
      case 'in_progress': return 'In Progress';
      case 'submitted': return 'Submitted';
      case 'completed': return 'Completed';
      case 'disconnected': return 'Disconnected';
      case 'timed_out': return 'Timed Out';
      case 'failed': return 'Failed';
      default: return 'Unknown';
    }
  };

  const getStatusIcon = (icon: PlayerWaitingStatus['statusIcon']): string => {
    switch (icon) {
      case 'clock': return '⏰';
      case 'spinner': return '⏳';
      case 'checkmark': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'offline': return '🔌';
      default: return '⏰';
    }
  };

  const getColorClass = (color: PlayerWaitingStatus['statusColor']): string => {
    switch (color) {
      case 'blue': return 'text-blue-600';
      case 'green': return 'text-green-600';
      case 'yellow': return 'text-yellow-600';
      case 'red': return 'text-red-600';
      case 'gray': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  };

  const getConnectionIndicator = (quality: PlayerWaitingStatus['connectionQuality']): string => {
    switch (quality) {
      case 'excellent': return '🔴🔴🔴🔴';
      case 'good': return '🔴🔴🔴⚪';
      case 'poor': return '🔴🔴⚪⚪';
      case 'unstable': return '🔴⚪⚪⚪';
      default: return '⚪⚪⚪⚪';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <span className="text-lg" role="img" aria-label={getStatusText(player.status)}>
          {getStatusIcon(player.statusIcon)}
        </span>
        <div>
          <div className="font-medium text-gray-900">
            {player.playerName}
          </div>
          <div className={`text-sm ${getColorClass(player.statusColor)}`}>
            {getStatusText(player.status)}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {player.isConnected && (
          <div className="text-xs text-gray-500" title={`Connection: ${player.connectionQuality}`}>
            {getConnectionIndicator(player.connectionQuality)}
          </div>
        )}
        
        {showProgress && player.submissionProgress && (
          <div className="text-sm text-gray-600">
            {player.submissionProgress.percentComplete}%
          </div>
        )}
        
        {player.waitTime > 0 && (
          <div className="text-xs text-gray-500">
            {Math.round(player.waitTime / 1000)}s
          </div>
        )}
      </div>
    </motion.div>
  );
};

/**
 * Progress bar component
 */
const ProgressBar: React.FC<ProgressBarProps> = ({ progress, showIndeterminate = false }) => {
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <span>{progress.completed} of {progress.total} completed</span>
        <span>{progress.percentage}%</span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        {showIndeterminate ? (
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: 'easeInOut'
            }}
            style={{ width: '30%' }}
          />
        ) : (
          <motion.div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress.percentage}%` }}
          />
        )}
      </div>
      
      {(progress.estimatedTimeRemaining > 0) && (
        <div className="text-xs text-gray-500 mt-1">
          Estimated time remaining: {Math.round(progress.estimatedTimeRemaining / 1000)}s
        </div>
      )}
    </div>
  );
};

/**
 * Timer display component
 */
const TimerDisplay: React.FC<TimerDisplayProps> = ({ timeRemaining, hasTimeout, isUrgent = false }) => {
  if (!hasTimeout) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <motion.div
      className={`text-center p-3 rounded-lg ${
        isUrgent 
          ? 'bg-red-100 border-2 border-red-400' 
          : 'bg-gray-100'
      }`}
      animate={isUrgent ? { scale: [1, 1.05, 1] } : {}}
      transition={isUrgent ? { repeat: Infinity, duration: 1 } : {}}
    >
      <div className={`text-2xl font-mono font-bold ${
        isUrgent ? 'text-red-600' : 'text-gray-700'
      }`}>
        {timeString}
      </div>
      <div className="text-sm text-gray-600">
        {isUrgent ? 'Time running out!' : 'Time remaining'}
      </div>
    </motion.div>
  );
};

/**
 * Main WaitingOverlay component
 */
export const WaitingOverlay: React.FC<WaitingOverlayProps> = ({
  waitingState,
  onCancel,
  onDismiss,
  className = ''
}) => {
  const [announcements, setAnnouncements] = useState<AccessibilityAnnouncement[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const announcementTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Handle accessibility announcements
  useEffect(() => {
    if (!waitingState?.accessibilityAnnouncements.length) return;

    const newAnnouncements = waitingState.accessibilityAnnouncements.filter(
      announcement => !announcement.announced
    );

    if (newAnnouncements.length === 0) return;

    newAnnouncements.forEach(announcement => {
      if (waitingState.screenReaderEnabled) {
        // Create ARIA live region announcement
        const liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', announcement.priority === 'critical' ? 'assertive' : 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        liveRegion.textContent = announcement.text;
        
        document.body.appendChild(liveRegion);
        
        setTimeout(() => {
          document.body.removeChild(liveRegion);
        }, 1000);
      }

      // Mark as announced
      announcement.announced = true;
    });

    setAnnouncements(prev => [...prev, ...newAnnouncements]);
  }, [waitingState?.accessibilityAnnouncements, waitingState?.screenReaderEnabled]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!waitingState?.isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && waitingState.allowCancel && onCancel) {
        event.preventDefault();
        onCancel();
      }
      
      if (event.key === 'Tab') {
        // Keep focus within overlay
        const focusableElements = overlayRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements && focusableElements.length > 0) {
          const firstElement = focusableElements[0] as HTMLElement;
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
          
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [waitingState?.isVisible, waitingState?.allowCancel, onCancel]);

  // Auto-dismiss handling
  useEffect(() => {
    if (!waitingState?.autoDismissOnComplete || !onDismiss) return;
    
    if (waitingState.progress.percentage === 100) {
      const timeout = setTimeout(() => {
        onDismiss();
      }, waitingState.dismissDelay);
      
      return () => clearTimeout(timeout);
    }
    
    // Return undefined if no cleanup needed
    return undefined;
  }, [waitingState?.autoDismissOnComplete, waitingState?.progress.percentage, waitingState?.dismissDelay, onDismiss]);

  // Don't render if not visible
  if (!waitingState?.isVisible) return null;

  const isUrgentTime = waitingState.timeRemaining !== undefined && waitingState.timeRemaining <= 10;
  const showIndeterminateProgress = waitingState.progress.showIndeterminateProgress;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiting-overlay-title"
        aria-describedby="waiting-overlay-description"
      >
        <motion.div
          ref={overlayRef}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <h2 
              id="waiting-overlay-title"
              className="text-xl font-semibold text-gray-900 mb-2"
            >
              {waitingState.message}
            </h2>
            
            {waitingState.detailedMessage && (
              <p 
                id="waiting-overlay-description"
                className="text-gray-600"
              >
                {waitingState.detailedMessage}
              </p>
            )}
          </div>

          {/* Timer */}
          {waitingState.timeRemaining !== undefined && (
            <div className="mb-6">
              <TimerDisplay
                timeRemaining={waitingState.timeRemaining}
                hasTimeout={waitingState.hasTimeout}
                isUrgent={isUrgentTime}
              />
            </div>
          )}

          {/* Progress Bar */}
          {waitingState.showProgressBar && (
            <div className="mb-6">
              <ProgressBar
                progress={waitingState.progress}
                showIndeterminate={showIndeterminateProgress}
              />
            </div>
          )}

          {/* Player List */}
          {waitingState.showPlayerList && waitingState.playerStatuses.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Player Status
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <AnimatePresence>
                  {waitingState.playerStatuses
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((player) => (
                      <PlayerStatusItem
                        key={player.playerId}
                        player={player}
                        showProgress={waitingState.waitingType === 'deck_submission'}
                      />
                    ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-3">
            {waitingState.allowCancel && onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            )}
            
            {waitingState.progress.percentage === 100 && onDismiss && (
              <button
                onClick={onDismiss}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Continue
              </button>
            )}
          </div>

          {/* Screen reader announcements (hidden visually) */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announcements.map((announcement) => (
              <div key={announcement.announcementId}>
                {announcement.text}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Hook for using WaitingOverlay with a WaitingStateManager
 */
export function useWaitingOverlay(waitingManager: { getWaitingState: () => WaitingOverlayState | null }) {
  const [waitingState, setWaitingState] = useState<WaitingOverlayState | null>(null);

  useEffect(() => {
    const updateState = () => {
      setWaitingState(waitingManager.getWaitingState());
    };

    // Initial state
    updateState();

    // Set up polling (in a real app, this would be event-driven)
    const interval = setInterval(updateState, 100);
    return () => clearInterval(interval);
  }, [waitingManager]);

  return waitingState;
}

export default WaitingOverlay;