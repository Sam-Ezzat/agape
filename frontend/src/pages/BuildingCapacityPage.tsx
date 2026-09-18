/**
 * Building Capacity Page (read-only)
 *
 * WHY: Conference House Managers need a simple, non-editable view of how
 * full each building is — left panel lists buildings with room count and
 * capacity, right panel shows the rooms (and who's assigned to each) for
 * whichever building is selected. No assign/unassign/drag affordances.
 */

import { useEffect, useState } from 'react';
import { Building2, DoorOpen, BedDouble, Users, UserCheck, Printer } from 'lucide-react';
import { buildingApi, assignmentApi, attendeeApi } from '@/services/api.service';
import { toastError } from '@/services/toast.service';
import type { Building, Room, RoomAssignment } from '@/types/api';

export default function BuildingCapacityPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [totalAttendees, setTotalAttendees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [buildingsRes, assignmentsRes, attendeesRes] = await Promise.all([
        buildingApi.list(),
        assignmentApi.list({ limit: '9999' }),
        attendeeApi.list({ limit: '1' }),
      ]);
      setBuildings(buildingsRes.data);
      setAssignments(assignmentsRes.data);
      setTotalAttendees(attendeesRes.pagination.total);
    } catch (error) {
      toastError('Failed to load building capacity data');
    } finally {
      setLoading(false);
    }
  };

  const getRoomsForBuilding = (building: Building): Room[] =>
    building.floors?.flatMap(floor =>
      (floor.rooms ?? []).map(room => ({ ...room, floor }))
    ) ?? [];

  const getRoomOccupancy = (roomId: string): number =>
    assignments.filter(a => a.roomId === roomId).length;

  const getRoomAssignments = (roomId: string): RoomAssignment[] =>
    assignments.filter(a => a.roomId === roomId);

  const getBuildingStats = (building: Building) => {
    const rooms = getRoomsForBuilding(building);
    const totalCapacity = rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
    const occupied = rooms.reduce((sum, room) => sum + getRoomOccupancy(room.id), 0);
    return { totalRooms: rooms.length, totalCapacity, occupied };
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId) || null;
  const selectedBuildingRooms = selectedBuilding ? getRoomsForBuilding(selectedBuilding) : [];

  const overallStats = buildings.reduce(
    (totals, building) => {
      const stats = getBuildingStats(building);
      return {
        totalRooms: totals.totalRooms + stats.totalRooms,
        totalCapacity: totals.totalCapacity + stats.totalCapacity,
        occupied: totals.occupied + stats.occupied,
      };
    },
    { totalRooms: 0, totalCapacity: 0, occupied: 0 }
  );
  const availableBeds = Math.max(overallStats.totalCapacity - overallStats.occupied, 0);

  const handlePrintExport = () => {
    // Only rooms that actually have someone assigned, grouped by building then floor/room number
    const occupiedRooms = [...buildings]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .flatMap(building =>
        getRoomsForBuilding(building)
          .filter(room => getRoomOccupancy(room.id) > 0)
          .sort((a, b) => {
            // Sort by room-number prefix (e.g. "C1"..."Cn") then by the trailing number
            const [, prefixA = '', numA = ''] = a.roomNumber.match(/^([^\d]*)(\d*)/) || [];
            const [, prefixB = '', numB = ''] = b.roomNumber.match(/^([^\d]*)(\d*)/) || [];
            const prefixDiff = prefixA.localeCompare(prefixB, undefined, { sensitivity: 'base' });
            if (prefixDiff !== 0) return prefixDiff;
            const numDiff = (parseInt(numA, 10) || 0) - (parseInt(numB, 10) || 0);
            return numDiff !== 0 ? numDiff : a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
          })
          .map(room => ({ building, room, assignments: getRoomAssignments(room.id) }))
      );

    if (occupiedRooms.length === 0) {
      toastError('No occupied rooms to export');
      return;
    }

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

    // Scale font down a bit for rooms with many occupants so the list still fits the tile
    const fontSizeForCount = (count: number) => {
      if (count <= 4) return '19pt';
      if (count <= 6) return '16pt';
      if (count <= 9) return '13pt';
      return '11pt';
    };

    const pages: string[] = [];
    for (let i = 0; i < occupiedRooms.length; i += 4) {
      const chunk = occupiedRooms.slice(i, i + 4);
      const cells = chunk
        .map(({ building, room, assignments: roomAssignments }) => {
          const items = roomAssignments
            .map(
              a =>
                `<li>${escapeHtml(a.attendee?.fullName || 'Unknown')}</li>`
            )
            .join('');
          return `
            <div class="cell">
              <div class="cell-header">
                <div class="room-number">${escapeHtml(room.roomNumber)}</div>
                <div class="building-name">${escapeHtml(building.name)}${room.floor ? ` - Floor ${room.floor.floorNumber}` : ''}</div>
              </div>
              <ol class="attendee-list" style="font-size: ${fontSizeForCount(roomAssignments.length)}">
                ${items}
              </ol>
            </div>`;
        })
        .join('');
      const filler = '<div class="cell cell-empty"></div>'.repeat(4 - chunk.length);
      pages.push(`<div class="page">${cells}${filler}</div>`);
    }

    const html = `<!DOCTYPE html>
<html lang="ar">
<head>
<meta charset="UTF-8" />
<title>Room Assignments</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
    color: #111;
  }
  .page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6mm;
    width: 100%;
    height: 281mm;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .cell {
    border: 2.5px solid #222;
    border-radius: 10px;
    padding: 6mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .cell-empty { border: 2.5px dashed #ccc; }
  .cell-header {
    text-align: center;
    border-bottom: 2px solid #222;
    padding-bottom: 3mm;
    margin-bottom: 3mm;
  }
  .room-number {
    font-size: 34pt;
    font-weight: 800;
    line-height: 1.1;
    direction: rtl;
    unicode-bidi: plaintext;
  }
  .building-name {
    font-size: 12pt;
    color: #444;
    margin-top: 1mm;
    direction: rtl;
    unicode-bidi: plaintext;
  }
  .attendee-list {
    flex: 1;
    margin: 0;
    padding-inline-start: 8mm;
    overflow: hidden;
    direction: rtl;
    unicode-bidi: plaintext;
    font-weight: 600;
    line-height: 1.5;
  }
  .attendee-list li { margin-bottom: 1mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pages.join('\n')}
<script>
  window.onload = function () {
    window.focus();
    window.print();
  };
</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toastError('Please allow pop-ups to export the print layout');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <p className="mt-2 text-gray-600 text-sm">Loading building capacity...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Building Capacity</h1>
          <p className="text-gray-600 mt-1">Select a building to view its rooms and current occupancy</p>
        </div>
        <button
          type="button"
          onClick={handlePrintExport}
          className="btn btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          <Printer size={18} />
          Export / Print
        </button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="card bg-gradient-to-br from-teal-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-teal-100 text-sm font-medium">Total Attendees</p>
              <p className="text-3xl font-bold mt-2">{totalAttendees}</p>
            </div>
            <div className="bg-white/20 rounded-full p-3">
              <UserCheck className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Buildings</p>
              <p className="text-3xl font-bold mt-2">{buildings.length}</p>
            </div>
            <div className="bg-white/20 rounded-full p-3">
              <Building2 className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Total Rooms</p>
              <p className="text-3xl font-bold mt-2">{overallStats.totalRooms}</p>
            </div>
            <div className="bg-white/20 rounded-full p-3">
              <DoorOpen className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Total Capacity</p>
              <p className="text-3xl font-bold mt-2">{overallStats.totalCapacity}</p>
            </div>
            <div className="bg-white/20 rounded-full p-3">
              <BedDouble className="w-8 h-8" />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-purple-100">Available: </span>
            <span className="font-semibold">{availableBeds}</span>
          </div>
        </div>

        <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Occupied Beds</p>
              <p className="text-3xl font-bold mt-2">{overallStats.occupied}</p>
            </div>
            <div className="bg-white/20 rounded-full p-3">
              <Users className="w-8 h-8" />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className="text-orange-100">Occupancy: </span>
            <span className="font-semibold">
              {overallStats.totalCapacity > 0
                ? `${((overallStats.occupied / overallStats.totalCapacity) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-20rem)] flex gap-4">
        {/* LEFT PANEL - Buildings */}
        <div className="w-1/3 min-w-[320px] flex flex-col bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Buildings</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {buildings.length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">No buildings found</p>
            ) : (
              buildings.map(building => {
                const stats = getBuildingStats(building);
                const isSelected = building.id === selectedBuildingId;

                return (
                  <button
                    key={building.id}
                    type="button"
                    onClick={() => setSelectedBuildingId(building.id)}
                    className={`w-full text-left border-2 rounded-lg p-4 transition-all ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Building2 className="text-gray-400 mt-0.5" size={20} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{building.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {stats.totalRooms} {stats.totalRooms === 1 ? 'room' : 'rooms'}
                        </p>
                        <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full font-medium ${
                          stats.occupied >= stats.totalCapacity
                            ? 'bg-red-100 text-red-700'
                            : stats.occupied === 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {stats.occupied}/{stats.totalCapacity} capacity
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL - Rooms */}
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedBuilding ? `Rooms in ${selectedBuilding.name}` : 'Rooms'}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selectedBuilding ? (
              <div className="text-center py-12">
                <DoorOpen className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-gray-500">Select a building to view its rooms</p>
              </div>
            ) : selectedBuildingRooms.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">This building has no rooms</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {selectedBuildingRooms.map(room => {
                  const occupancy = getRoomOccupancy(room.id);
                  const roomAssignments = getRoomAssignments(room.id);
                  const isFull = occupancy >= room.capacity;
                  const isEmpty = occupancy === 0;

                  return (
                    <div
                      key={room.id}
                      className={`border-2 rounded-lg p-4 ${
                        isFull ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">Room {room.roomNumber}</h3>
                          <p className="text-xs text-gray-500">Floor {room.floor?.floorNumber}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          isFull
                            ? 'bg-red-100 text-red-700'
                            : isEmpty
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {occupancy}/{room.capacity}
                        </span>
                      </div>

                      <span className="inline-block text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mb-3">
                        {room.roomType}
                      </span>

                      {roomAssignments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-500 mb-2">Assigned:</p>
                          <div className="space-y-1">
                            {roomAssignments.map(assignment => (
                              <p key={assignment.id} className="text-xs text-gray-700 truncate">
                                {assignment.attendee?.fullName || 'Unknown'}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
