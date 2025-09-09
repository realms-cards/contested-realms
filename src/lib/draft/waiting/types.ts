/**
 * Types for Draft Waiting Overlay System
 * Implements waiting overlay that shows progress of all players during deck submission
 */

// Core waiting overlay state
export interface WaitingOverlayState {
  sessionId: string;
  isVisible: boolean;
  waitingType: WaitingType;
  
  // Display content
  message: string;
  detailedMessage?: string;
  progress: WaitingProgress;
  
  // Player status tracking
  playerStatuses: PlayerWaitingStatus[];
  
  // Timing information
  startTime: number;
  estimatedEndTime?: number;
  timeRemaining?: number; // seconds
  hasTimeout: boolean;
  timeoutDuration?: number; // seconds
  
  // Visual and UX
  showProgressBar: boolean;
  showPlayerList: boolean;
  allowCancel: boolean;
  
  // Accessibility
  accessibilityAnnouncements: AccessibilityAnnouncement[];
  screenReaderEnabled: boolean;
  
  // Auto-dismiss behavior
  autoDismissOnComplete: boolean;
  dismissDelay: number; // ms after completion
}

export type WaitingType = 
  | 'deck_submission'
  | 'pick_synchronization'
  | 'pack_rotation'
  | 'reconnection'
  | 'validation'
  | 'match_start';

// Progress tracking for the waiting overlay
export interface WaitingProgress {
  completed: number;
  total: number;
  percentage: number;
  
  // Progress breakdown
  submittedPlayers: number;
  waitingPlayers: number;
  timedOutPlayers: number;
  disconnectedPlayers: number;
  
  // Timing
  averageWaitTime: number; // ms
  estimatedTimeRemaining: number; // ms
  
  // Visual indicators
  progressBarVisible: boolean;
  showIndeterminateProgress: boolean;
}

// Individual player status in waiting overlay
export interface PlayerWaitingStatus {
  playerId: string;
  playerName: string;
  status: PlayerStatus;
  
  // Timing
  startTime: number;
  lastActivityTime: number;
  waitTime: number; // ms since start
  
  // Connection info
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unstable';
  
  // Visual indicators
  displayOrder: number;
  statusIcon: StatusIcon;
  statusColor: StatusColor;
  
  // Progress details (for deck submission)
  submissionProgress?: SubmissionProgress;
}

export type PlayerStatus = 
  | 'waiting'
  | 'in_progress'
  | 'submitted'
  | 'completed'
  | 'disconnected'
  | 'timed_out'
  | 'failed';

export type StatusIcon = 
  | 'clock'
  | 'spinner'
  | 'checkmark'
  | 'warning'
  | 'error'
  | 'offline';

export type StatusColor = 
  | 'blue'    // waiting/in_progress
  | 'green'   // submitted/completed  
  | 'yellow'  // warning/timeout approaching
  | 'red'     // error/timed_out
  | 'gray';   // disconnected

// Detailed submission progress for individual players
export interface SubmissionProgress {
  phase: SubmissionPhase;
  percentComplete: number;
  currentStep: string;
  stepsCompleted: string[];
  stepsRemaining: string[];
  
  // Validation status
  validationPassed: boolean;
  validationErrors: string[];
  
  // Upload/sync status
  dataTransferred: number; // bytes
  totalDataSize: number; // bytes
  transferRate: number; // bytes/sec
}

export type SubmissionPhase = 
  | 'preparing'
  | 'validating'
  | 'uploading'
  | 'processing'
  | 'complete';

// Waiting message configuration
export interface WaitingMessage {
  messageId: string;
  waitingType: WaitingType;
  context: MessageContext;
  
  // Message content
  primary: string;
  secondary?: string;
  actionText?: string;
  
  // Personalization
  playerName?: string;
  playerCount?: number;
  completedCount?: number;
  
  // Timing context
  timeRemaining?: number;
  isUrgent: boolean;
  
  // Accessibility
  screenReaderText?: string;
  ariaLabel?: string;
}

export interface MessageContext {
  sessionId: string;
  totalPlayers: number;
  playersWaiting: string[];
  playersCompleted: string[];
  timeElapsed: number;
  hasTimeout: boolean;
}

// Accessibility and screen reader support
export interface AccessibilityAnnouncement {
  announcementId: string;
  timestamp: number;
  text: string;
  priority: AnnouncementPriority;
  
  // Targeting
  announced: boolean;
  acknowledgeRequired: boolean;
  
  // Context
  triggerEvent: string;
  relatedPlayerId?: string;
}

export type AnnouncementPriority = 
  | 'low'      // Progress updates
  | 'medium'   // Player status changes
  | 'high'     // Warnings, timeouts
  | 'critical'; // Errors, failures

// Timeout and warning system
export interface TimeoutConfiguration {
  totalTimeout: number; // ms
  warningThresholds: TimeoutWarning[];
  
  // Escalation behavior
  escalationEnabled: boolean;
  escalationSteps: EscalationStep[];
  
  // Grace period for late submissions
  gracePeriod: number; // ms
  allowGracePeriod: boolean;
}

export interface TimeoutWarning {
  threshold: number; // ms remaining
  message: string;
  severity: 'info' | 'warning' | 'critical';
  soundEnabled: boolean;
  visualIndicator: boolean;
}

export interface EscalationStep {
  timeRemaining: number; // ms
  action: EscalationAction;
  message: string;
  autoExecute: boolean;
}

export type EscalationAction = 
  | 'show_warning'
  | 'play_sound'
  | 'highlight_player'
  | 'send_reminder'
  | 'auto_submit'
  | 'skip_player';

// Real-time updates and synchronization
export interface WaitingUpdateEvent {
  sessionId: string;
  updateId: string;
  timestamp: number;
  updateType: WaitingUpdateType;
  
  // Update payload
  playerId?: string;
  newStatus?: PlayerStatus;
  progress?: Partial<WaitingProgress>;
  message?: string;
  
  // Synchronization
  broadcastToAll: boolean;
  requiresAcknowledgment: boolean;
  
  // Visual updates
  triggerAnimation: boolean;
  soundNotification: boolean;
}

export type WaitingUpdateType = 
  | 'player_status_change'
  | 'progress_update'
  | 'message_update'
  | 'timeout_warning'
  | 'completion'
  | 'dismissal';

// Overlay configuration and theming
export interface OverlayConfiguration {
  // Visual appearance
  theme: OverlayTheme;
  animations: AnimationConfig;
  
  // Behavior
  behavior: OverlayBehavior;
  
  // Performance
  performance: PerformanceConfig;
  
  // Accessibility
  accessibility: AccessibilityConfig;
}

export interface OverlayTheme {
  backgroundOpacity: number;
  cornerRadius: number;
  shadowIntensity: number;
  
  // Colors
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  
  // Typography
  fontFamily: string;
  fontSize: {
    title: number;
    body: number;
    caption: number;
  };
}

export interface AnimationConfig {
  enableAnimations: boolean;
  reducedMotion: boolean;
  
  // Timing
  fadeInDuration: number; // ms
  fadeOutDuration: number; // ms
  progressAnimationSpeed: number; // ms per %
  
  // Effects
  enablePulse: boolean;
  enableGlow: boolean;
  enableParticles: boolean;
}

export interface OverlayBehavior {
  showOnInit: boolean;
  hideOnComplete: boolean;
  allowBackgroundClick: boolean;
  allowEscapeKey: boolean;
  
  // Auto-dismiss
  autoDismissDelay: number; // ms
  requireExplicitDismiss: boolean;
  
  // Interaction
  allowCancel: boolean;
  showMinimizeButton: boolean;
  allowDragToMove: boolean;
}

export interface PerformanceConfig {
  updateThrottleMs: number;
  maxConcurrentAnimations: number;
  enableGPUAcceleration: boolean;
  
  // Memory management
  maxHistoryEntries: number;
  cleanupInterval: number; // ms
}

export interface AccessibilityConfig {
  enableScreenReader: boolean;
  highContrastMode: boolean;
  largeTextMode: boolean;
  
  // Keyboard navigation
  enableKeyboardNav: boolean;
  trapFocus: boolean;
  
  // Announcements
  announceProgressUpdates: boolean;
  announcePlayerChanges: boolean;
  maxAnnouncementFreq: number; // ms
}

// Waiting state management and coordination
export interface WaitingCoordination {
  sessionId: string;
  coordinatorId: string; // Usually the host player
  
  // State tracking
  activeWaiting: Map<string, WaitingOverlayState>;
  globalProgress: WaitingProgress;
  
  // Synchronization
  lastSyncTime: number;
  syncVersion: number;
  pendingUpdates: WaitingUpdateEvent[];
  
  // Coordination rules
  requireAllPlayers: boolean;
  allowPartialCompletion: boolean;
  majorityThreshold: number; // % of players needed
  
  // Timeout management
  globalTimeout: TimeoutConfiguration;
  playerTimeouts: Map<string, TimeoutConfiguration>;
  
  // Player tracking for hooks
  playersSubmitted: string[];
  playersBuilding: string[];
  playersTimedOut: string[];
  allPlayersReady: boolean;
  canProceedToNextPhase: boolean;
  waitingOverlayActive: boolean;
}

// Performance metrics for waiting overlay
export interface WaitingMetrics {
  sessionId: string;
  waitingType: WaitingType;
  
  // Timing metrics
  totalWaitTime: number; // ms
  averagePlayerWaitTime: number; // ms
  maxPlayerWaitTime: number; // ms
  minPlayerWaitTime: number; // ms
  
  // Completion metrics
  completionRate: number; // %
  timeoutRate: number; // %
  disconnectionRate: number; // %
  
  // Performance metrics
  overlayRenderTime: number; // ms
  updateLatency: number; // ms
  animationFrameRate: number;
  
  // User experience
  userCancelRate: number; // %
  userComplaintCount: number;
  accessibilityUsage: number; // %
  
  // System metrics
  memoryUsage: number; // MB
  cpuUsage: number; // %
  networkTraffic: number; // bytes
}

// Complete waiting state manager state
export interface WaitingManagerState {
  // Current overlay state
  overlayState: WaitingOverlayState | null;
  
  // Configuration
  configuration: OverlayConfiguration;
  
  // Coordination
  coordination: WaitingCoordination | null;
  
  // Metrics and monitoring
  metrics: WaitingMetrics | null;
  
  // State management
  isActive: boolean;
  isPaused: boolean;
  hasError: boolean;
  errorMessage?: string;
  
  // Update queue
  pendingUpdates: WaitingUpdateEvent[];
  lastUpdateTime: number;
  
  // Accessibility state
  screenReaderActive: boolean;
  highContrastActive: boolean;
  keyboardNavigationActive: boolean;
}