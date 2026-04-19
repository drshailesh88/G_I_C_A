import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetEventBySlug,
  mockGetPublicProgramData,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetEventBySlug: vi.fn(),
  mockGetPublicProgramData: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}));

vi.mock('@/lib/actions/event', () => ({
  getEventBySlug: mockGetEventBySlug,
}));

vi.mock('@/lib/actions/program', () => ({
  getPublicProgramData: mockGetPublicProgramData,
}));

vi.mock('./program-client', () => ({
  PublicProgramClient: vi.fn(() => null),
}));

import PublicProgramPage from './page';
import { PublicProgramClient } from './program-client';

const EVENT = {
  id: '550e8400-e29b-41d4-a716-446655440099',
  slug: 'gem-india-2026',
  name: 'GEM India 2026',
  timezone: 'Asia/Kolkata',
  status: 'published',
};

const PROGRAM_DATA = {
  hasPublishedVersion: true,
  sessions: [],
  halls: [],
};

describe('PublicProgramPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the public program for published events', async () => {
    mockGetEventBySlug.mockResolvedValue(EVENT);
    mockGetPublicProgramData.mockResolvedValue(PROGRAM_DATA);

    const result = await PublicProgramPage({
      params: Promise.resolve({ eventSlug: EVENT.slug }),
      searchParams: Promise.resolve({ d: '2026-12-15' }),
    });

    expect(mockGetEventBySlug).toHaveBeenCalledWith(EVENT.slug);
    expect(mockGetPublicProgramData).toHaveBeenCalledWith(EVENT.id);
    expect(result).toMatchObject({
      type: PublicProgramClient,
      props: expect.objectContaining({
        event: EVENT,
        sessions: [],
        halls: [],
        hasPublishedVersion: true,
        initialDate: '2026-12-15',
      }),
    });
  });

  it('returns notFound for non-published events even if a snapshot exists', async () => {
    mockGetEventBySlug.mockResolvedValue({
      ...EVENT,
      status: 'completed',
    });

    await expect(
      PublicProgramPage({
        params: Promise.resolve({ eventSlug: EVENT.slug }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('notFound');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockGetPublicProgramData).not.toHaveBeenCalled();
  });

  it('returns notFound when no published program snapshot exists', async () => {
    mockGetEventBySlug.mockResolvedValue(EVENT);
    mockGetPublicProgramData.mockResolvedValue({
      ...PROGRAM_DATA,
      hasPublishedVersion: false,
    });

    await expect(
      PublicProgramPage({
        params: Promise.resolve({ eventSlug: EVENT.slug }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('notFound');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});
