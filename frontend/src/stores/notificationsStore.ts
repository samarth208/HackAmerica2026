// Read DESIGN.md and CLAUDE.md before modifying.
import { create } from "zustand";

export interface Notification {
  id: string;
  type: "alert_p1" | "alert_p2" | "training_failed" | "info";
  message: string;
  timestamp: Date;
  read: boolean;
  link?: string;
}

interface NotificationsState {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],

  addNotification: (n: Omit<Notification, "id" | "read">): void => {
    const newNotification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      read: false,
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 100),
    }));
  },

  markRead: (id: string): void => {
    set((state) => ({
      notifications: state.notifications.map(
        (n): Notification => (n.id === id ? { ...n, read: true } : n)
      ),
    }));
  },

  markAllRead: (): void => {
    set((state) => ({
      notifications: state.notifications.map(
        (n): Notification => ({ ...n, read: true })
      ),
    }));
  },

  dismiss: (id: string): void => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

export const selectUnreadCount = (state: NotificationsState): number =>
  state.notifications.filter((n) => !n.read).length;

export const selectUnreadCritical = (state: NotificationsState): number =>
  state.notifications.filter((n) => n.type === "alert_p1" && !n.read).length;
