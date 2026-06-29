/**
 * Dashboard Page
 * 
 * WHY: Main overview page showing system statistics
 * Displays attendee stats, room occupancy, and recent activity
 * 
 * API Endpoints Used:
 * - GET /api/dashboard/stats (overall statistics)
 * - GET /api/dashboard/occupancy (building/floor occupancy)
 * - GET /api/dashboard/recent-activity (recent actions)
 */

import { useEffect, useState } from 'react';
import { dashboardApi } from '@/services/api.service';
import { toastError } from '@/services/toast.service';
import type { DashboardStats, OccupancyBreakdown, AuditLog } from '@/types/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyBreakdown[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsResponse, occupancyResponse, activityResponse] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getOccupancy(),
        dashboardApi.getRecentActivity(10),
      ]);

      setStats(statsResponse.data);
      setOccupancy(occupancyResponse.data);
      setRecentActivity(activityResponse.data);
    } catch (error) {
      toastError('Failed to load dashboard data');
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={loadDashboardData}
          className="btn-secondary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Attendees */}
          <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Attendees</p>
                <p className="text-3xl font-bold mt-2">{stats.attendees.total}</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <span className="text-blue-100">Checked In: </span>
              <span className="font-semibold">{stats.attendees.checkedIn}</span>
            </div>
          </div>

          {/* Total Rooms */}
          <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Total Rooms</p>
                <p className="text-3xl font-bold mt-2">{stats.rooms.total}</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <span className="text-green-100">Occupied: </span>
              <span className="font-semibold">{stats.rooms.occupied}</span>
            </div>
          </div>

          {/* Occupancy Rate */}
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Occupancy Rate</p>
                <p className="text-3xl font-bold mt-2">{stats.rooms.occupancyRate.toFixed(1)}%</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <span className="text-purple-100">Available: </span>
              <span className="font-semibold">{stats.rooms.available}</span>
            </div>
          </div>

          {/* Assignments Today */}
          <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Assignments Today</p>
                <p className="text-3xl font-bold mt-2">{stats.assignments.today}</p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <span className="text-orange-100">Total: </span>
              <span className="font-semibold">{stats.assignments.total}</span>
            </div>
          </div>
        </div>
      )}

      {/* Occupancy Breakdown */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Room Occupancy by Building</h2>
        <div className="space-y-6">
          {occupancy.map((house) => (
            <div key={house.id}>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">{house.name}</h3>
              {house.buildings.map((building) => (
                <div key={building.id} className="mb-4 ml-4">
                  <h4 className="text-md font-medium text-gray-700 mb-2">{building.name}</h4>
                  <div className="space-y-2">
                    {building.floors.map((floor) => (
                      <div key={floor.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{floor.name}</p>
                          <p className="text-xs text-gray-500">
                            {floor.roomCount} rooms • Capacity: {floor.capacity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {floor.occupied} / {floor.capacity}
                            </p>
                            <p className="text-xs text-gray-500">{floor.occupancyRate}% occupied</p>
                          </div>
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-400 to-green-600"
                              style={{ width: `${floor.occupancyRate}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 mt-1">
                  {log.action === 'create' && (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {log.action === 'check_in' && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {log.action === 'assign' && (
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {log.action.replace('_', ' ').toUpperCase()} - {log.entityType}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                  {log.details && (
                    <p className="text-xs text-gray-600 mt-1">
                      {JSON.stringify(log.details).substring(0, 100)}...
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-8">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
