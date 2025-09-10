/**
 * Connection Status Indicator Component
 * Shows WebRTC connection status with error messages and retry functionality
 */

import React, { useState, useEffect } from 'react';
import type { ConnectionStatusIndicatorProps } from '../../../specs/006-live-video-and/contracts/ui-components';

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  connectionState,
  lastError,
  onRetry,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-collapse after success
  useEffect(() => {
    if (connectionState === 'connected') {
      const timer = setTimeout(() => setIsExpanded(false), 3000);
      return () => clearTimeout(timer);
    }
    
    return undefined;
  }, [connectionState]);

  // Auto-expand on errors
  useEffect(() => {
    if (connectionState === 'failed' && lastError) {
      setIsExpanded(true);
    }
    
    return undefined;
  }, [connectionState, lastError]);

  const getStatusConfig = () => {
    switch (connectionState) {
      case 'idle':
        return {
          color: 'gray',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
            </svg>
          ),
          label: 'Disconnected',
          description: 'Video chat is not active'
        };
        
      case 'joining':
        return {
          color: 'blue',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-600',
          borderColor: 'border-blue-200',
          icon: (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ),
          label: 'Joining...',
          description: 'Joining video chat session'
        };

      case 'negotiating':
        return {
          color: 'yellow',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-600',
          borderColor: 'border-yellow-200',
          icon: (
            <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          ),
          label: 'Connecting...',
          description: 'Establishing peer connection'
        };

      case 'connected':
        return {
          color: 'green',
          bgColor: 'bg-green-100',
          textColor: 'text-green-600',
          borderColor: 'border-green-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          ),
          label: 'Connected',
          description: 'Video chat is active'
        };

      case 'failed':
        return {
          color: 'red',
          bgColor: 'bg-red-100',
          textColor: 'text-red-600',
          borderColor: 'border-red-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          ),
          label: 'Connection Failed',
          description: lastError || 'Unable to establish video connection'
        };

      case 'closed':
        return {
          color: 'gray',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"/>
            </svg>
          ),
          label: 'Disconnected',
          description: 'Video chat session ended'
        };

      default:
        return {
          color: 'gray',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-600',
          borderColor: 'border-gray-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          ),
          label: 'Unknown',
          description: 'Connection status unavailable'
        };
    }
  };

  const config = getStatusConfig();

  // Don't show indicator for idle state in compact mode unless there's an error
  if (compact && connectionState === 'idle' && !lastError) {
    return null;
  }

  // Compact mode - just a status dot with tooltip
  if (compact && !isExpanded) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsExpanded(true)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`
            flex items-center gap-2 px-2 py-1
            ${config.bgColor} ${config.borderColor} ${config.textColor}
            border rounded-full
            hover:shadow-sm transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
          `}
          title={config.description}
        >
          {config.icon}
          <span className="text-xs font-medium">
            {config.label}
          </span>
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div className="
            absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
            px-2 py-1 bg-gray-900 text-white text-xs rounded
            whitespace-nowrap z-50
          ">
            {config.description}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}
      </div>
    );
  }

  // Full status indicator
  return (
    <div className={`
      ${config.bgColor} ${config.borderColor}
      border rounded-lg shadow-sm
      transition-all duration-200 ease-out
    `}>
      {/* Header */}
      <div className={`
        flex items-center justify-between p-3
        ${compact ? 'cursor-pointer' : ''}
      `} onClick={compact ? () => setIsExpanded(!isExpanded) : undefined}>
        <div className="flex items-center gap-2">
          {config.icon}
          <span className={`text-sm font-medium ${config.textColor}`}>
            {config.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {connectionState === 'failed' && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="
                text-xs px-2 py-1 bg-white border border-gray-300 rounded
                hover:bg-gray-50 transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500
              "
            >
              Retry
            </button>
          )}

          {compact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className={`
                p-1 rounded hover:bg-white/50 transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500
                ${config.textColor}
              `}
            >
              <svg 
                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Details */}
      {(isExpanded || !compact) && (
        <div className="px-3 pb-3 border-t border-white/20">
          <p className={`text-xs ${config.textColor} opacity-80 mt-2`}>
            {config.description}
          </p>

          {lastError && connectionState === 'failed' && (
            <div className="mt-2 p-2 bg-white/50 rounded text-xs text-red-700">
              <strong>Error:</strong> {lastError}
            </div>
          )}

          {/* Additional status info */}
          <div className="mt-2 flex items-center gap-4 text-xs opacity-60">
            <span>Status: {connectionState}</span>
            <span>•</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};