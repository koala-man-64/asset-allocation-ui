import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireSession } from './RequireSession';
import { ApiError } from '@/services/apiService';
import { DataService } from '@/services/DataService';

const mockUseRealtime = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({
  authRequired: true,
  oidcEnabled: true
}));
const mockAuth = vi.hoisted(() => ({
  ready: false
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth
}));

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: mockUseRealtime
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getAuthSessionStatusWithMeta: vi.fn()
  }
}));

function renderRequireSession(children: ReactNode = <div data-testid="protected">Protected</div>) {
  return render(
    <MemoryRouter initialEntries={['/system-status']}>
      <Routes>
        <Route path="/login" element={<div data-testid="login">Login</div>} />
        <Route path="/system-status" element={<RequireSession>{children}</RequireSession>} />
      </Routes>
    </MemoryRouter>
  );
}

function ProtectedRouteHarness() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div>
      <button onClick={() => navigate('/data-explorer')} type="button">
        Go data
      </button>
      <div data-testid="current-route">{location.pathname}</div>
    </div>
  );
}

function renderProtectedRouteHarness() {
  return render(
    <MemoryRouter initialEntries={['/system-status']}>
      <Routes>
        <Route path="/login" element={<div data-testid="login">Login</div>} />
        <Route
          path="*"
          element={
            <RequireSession>
              <ProtectedRouteHarness />
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    mockConfig.authRequired = true;
    mockConfig.oidcEnabled = true;
    mockAuth.ready = false;
    mockUseRealtime.mockReset();
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockReset();
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(401, 'API Error: 401 Unauthorized')
    );
  });

  it('waits for OIDC bootstrap before probing the API session on protected routes', async () => {
    const view = renderRequireSession();

    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();

    mockAuth.ready = true;
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue({
      data: {
        authMode: 'oidc',
        subject: 'user-123',
        requiredRoles: ['AssetAllocation.Access'],
        grantedRoles: ['AssetAllocation.Access']
      },
      meta: {
        requestId: 'req-1',
        status: 200,
        durationMs: 10,
        url: '/api/auth/session'
      }
    });

    view.rerender(
      <MemoryRouter initialEntries={['/system-status']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">Login</div>} />
          <Route
            path="/system-status"
            element={
              <RequireSession>
                <div data-testid="protected">Protected</div>
              </RequireSession>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('protected')).toBeInTheDocument();
    });
  });

  it('does not render a new protected route until that route session check completes', async () => {
    mockAuth.ready = true;

    type SessionProbeResult = {
      data: {
        authMode: string;
        subject: string;
        requiredRoles: string[];
        grantedRoles: string[];
      };
      meta: {
        requestId: string;
        status: number;
        durationMs: number;
        url: string;
      };
    };

    let resolveNextSession!: (value: SessionProbeResult) => void;
    const nextSessionPromise = new Promise<SessionProbeResult>((resolve) => {
      resolveNextSession = resolve;
    });

    vi.mocked(DataService.getAuthSessionStatusWithMeta)
      .mockResolvedValueOnce({
        data: {
          authMode: 'oidc',
          subject: 'user-123',
          requiredRoles: ['AssetAllocation.Access'],
          grantedRoles: ['AssetAllocation.Access']
        },
        meta: {
          requestId: 'req-1',
          status: 200,
          durationMs: 10,
          url: '/api/auth/session'
        }
      })
      .mockImplementationOnce(() => nextSessionPromise);

    renderProtectedRouteHarness();

    expect(await screen.findByTestId('current-route')).toHaveTextContent('/system-status');

    fireEvent.click(screen.getByRole('button', { name: 'Go data' }));

    await waitFor(() => {
      expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('current-route')).not.toBeInTheDocument();

    resolveNextSession({
      data: {
        authMode: 'oidc',
        subject: 'user-123',
        requiredRoles: ['AssetAllocation.Access'],
        grantedRoles: ['AssetAllocation.Access']
      },
      meta: {
        requestId: 'req-2',
        status: 200,
        durationMs: 10,
        url: '/api/auth/session'
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent('/data-explorer');
    });
  });
});
