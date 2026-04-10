import { describe, it, expect, vi } from 'vitest';

// Mock transitive DB-dependent imports before importing the module under test
vi.mock('@/lib/actions/transport', () => ({
  movePassenger: vi.fn(),
  createVehicleAssignment: vi.fn(),
}));
vi.mock('@/lib/validations/transport', () => ({
  VEHICLE_TYPES: ['sedan', 'suv', 'van', 'tempo_traveller', 'bus', 'other'],
}));

import { getKanbanLayoutClasses } from './vehicle-kanban-client';
import type { NavMode } from '@/hooks/use-responsive-nav';

// ── getKanbanLayoutClasses ──────────────────────────────────

describe('getKanbanLayoutClasses', () => {
  // ── Mobile: vertical stack, no drag-drop ──────────────────

  describe('mobile', () => {
    const layout = getKanbanLayoutClasses('mobile');

    it('uses vertical flex layout for the board', () => {
      expect(layout.boardClasses).toContain('flex-col');
    });

    it('does not enable horizontal scroll', () => {
      expect(layout.boardClasses).not.toContain('overflow-x-auto');
    });

    it('columns are full width', () => {
      expect(layout.columnClasses).toContain('w-full');
    });

    it('columns do not have fixed min-width', () => {
      expect(layout.columnClasses).not.toContain('min-w-');
    });

    it('disables drag-drop', () => {
      expect(layout.enableDragDrop).toBe(false);
    });

    it('add-vehicle button is full width', () => {
      expect(layout.addVehicleClasses).toContain('w-full');
    });
  });

  // ── Tablet: horizontal scroll-snap kanban ─────────────────

  describe('tablet', () => {
    const layout = getKanbanLayoutClasses('tablet');

    it('uses horizontal flex layout', () => {
      expect(layout.boardClasses).toContain('flex');
      expect(layout.boardClasses).not.toContain('flex-col');
    });

    it('enables horizontal scroll', () => {
      expect(layout.boardClasses).toContain('overflow-x-auto');
    });

    it('enables scroll-snap', () => {
      expect(layout.boardClasses).toContain('snap-x');
      expect(layout.boardClasses).toContain('snap-mandatory');
    });

    it('columns have min-width 300px', () => {
      expect(layout.columnClasses).toContain('min-w-[300px]');
    });

    it('columns snap to start', () => {
      expect(layout.columnClasses).toContain('snap-start');
    });

    it('columns do not grow to fill', () => {
      expect(layout.columnClasses).toContain('flex-shrink-0');
    });

    it('enables drag-drop', () => {
      expect(layout.enableDragDrop).toBe(true);
    });
  });

  // ── Desktop: all columns visible side-by-side ─────────────

  describe('desktop', () => {
    const layout = getKanbanLayoutClasses('desktop');

    it('uses horizontal flex layout', () => {
      expect(layout.boardClasses).toContain('flex');
      expect(layout.boardClasses).not.toContain('flex-col');
    });

    it('does not enable scroll-snap', () => {
      expect(layout.boardClasses).not.toContain('snap-x');
    });

    it('columns fill available space', () => {
      expect(layout.columnClasses).toContain('flex-1');
    });

    it('columns have a reasonable min-width', () => {
      expect(layout.columnClasses).toContain('min-w-[250px]');
    });

    it('enables drag-drop', () => {
      expect(layout.enableDragDrop).toBe(true);
    });
  });

  // ── All modes return all required keys ────────────────────

  describe('return shape', () => {
    const modes: NavMode[] = ['mobile', 'tablet', 'desktop'];

    it.each(modes)('%s returns boardClasses, columnClasses, addVehicleClasses, enableDragDrop', (mode) => {
      const layout = getKanbanLayoutClasses(mode);
      expect(layout).toHaveProperty('boardClasses');
      expect(layout).toHaveProperty('columnClasses');
      expect(layout).toHaveProperty('addVehicleClasses');
      expect(layout).toHaveProperty('enableDragDrop');
    });
  });
});
