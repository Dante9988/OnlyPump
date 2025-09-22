'use client';

import { useState, useEffect } from 'react';
import Notification, { NotificationProps } from './Notification';

export default function NotificationContainer() {
  const [notifications, setNotifications] = useState<NotificationProps[]>([]);

  // Listen for custom events to add notifications
  useEffect(() => {
    const handleNewNotification = (event: CustomEvent) => {
      const notification = event.detail as NotificationProps;
      addNotification(notification);
    };

    // Add event listener
    window.addEventListener('notification' as any, handleNewNotification as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('notification' as any, handleNewNotification as EventListener);
    };
  }, []);

  const addNotification = (notification: NotificationProps) => {
    const id = notification.id || `notification-${Date.now()}`;
    setNotifications(prev => [...prev, { ...notification, id }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          {...notification}
          onClose={removeNotification}
        />
      ))}
    </div>
  );
}

// Helper function to show notifications from anywhere in the app
export const showNotification = (notification: Omit<NotificationProps, 'id'>) => {
  const event = new CustomEvent('notification', {
    detail: {
      ...notification,
      id: `notification-${Date.now()}`
    }
  });
  
  window.dispatchEvent(event);
};
