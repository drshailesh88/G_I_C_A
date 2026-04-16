import { describe, it, expect } from 'vitest';
import { EXPORT_TYPES } from './types';

describe('EXPORT_TYPES', () => {
  it('attendee-list has correct label and description', () => {
    expect(EXPORT_TYPES['attendee-list'].label).toBe('Attendee List');
    expect(EXPORT_TYPES['attendee-list'].description).toBe(
      'All registrations with person details and status'
    );
  });

  it('travel-roster has correct label and description', () => {
    expect(EXPORT_TYPES['travel-roster'].label).toBe('Travel Roster');
    expect(EXPORT_TYPES['travel-roster'].description).toBe(
      'All travel records with journey details'
    );
  });

  it('rooming-list has correct label and description', () => {
    expect(EXPORT_TYPES['rooming-list'].label).toBe('Rooming List');
    expect(EXPORT_TYPES['rooming-list'].description).toBe(
      'Accommodation records grouped by hotel'
    );
  });

  it('transport-plan has correct label and description', () => {
    expect(EXPORT_TYPES['transport-plan'].label).toBe('Transport Plan');
    expect(EXPORT_TYPES['transport-plan'].description).toBe(
      'Transport batches with vehicles and passenger assignments'
    );
  });

  it('faculty-responsibilities has correct label and description', () => {
    expect(EXPORT_TYPES['faculty-responsibilities'].label).toBe('Faculty Responsibilities');
    expect(EXPORT_TYPES['faculty-responsibilities'].description).toBe(
      'Session assignments per faculty member'
    );
  });

  it('attendance-report has correct label and description', () => {
    expect(EXPORT_TYPES['attendance-report'].label).toBe('Attendance Report');
    expect(EXPORT_TYPES['attendance-report'].description).toBe(
      'Check-in records with method and timestamp'
    );
  });
});
