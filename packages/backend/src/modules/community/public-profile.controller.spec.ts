import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PublicProfileController } from './public-profile.controller';
import type { PublicProfileService } from './public-profile.service';

describe('PublicProfileController exact account search', () => {
  const viewerId = 'viewer-internal-id';

  function controller(overrides: Partial<PublicProfileService> = {}) {
    const profiles = {
      get: jest.fn(),
      getByUsername: jest.fn(),
      ...overrides,
    } as unknown as PublicProfileService;
    return { controller: new PublicProfileController(profiles), profiles };
  }

  it('normalizes an exact @username without exposing email lookup', async () => {
    const getByUsername = jest.fn().mockResolvedValue({ publicId: 'public-id' });
    const { controller: target } = controller({ getByUsername } as never);

    await expect(target.exactSearch(viewerId, { username: '@XiaoLi_01' }))
      .resolves.toEqual({ items: [{ publicId: 'public-id' }] });
    expect(getByUsername).toHaveBeenCalledWith('xiaoli_01', viewerId);
  });

  it('keeps publicId lookup and returns an empty exact-search page when absent', async () => {
    const get = jest.fn().mockRejectedValue(new NotFoundException({ code: 'USER_NOT_FOUND' }));
    const { controller: target } = controller({ get } as never);
    await expect(target.exactSearch(viewerId, {
      publicId: '11111111-1111-4111-8111-111111111111',
    })).resolves.toEqual({ items: [] });
  });

  it('rejects extra fields and identifiers that are not exact usernames', async () => {
    const { controller: target } = controller();
    await expect(target.exactSearch(viewerId, {
      username: 'abc', email: 'private@example.com',
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(target.exactSearch(viewerId, { username: 'contains space' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
