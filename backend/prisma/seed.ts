/**
 * Database Seed Script
 * 
 * WHY: Populate database with test data for local development
 * Creates a sample conference house with buildings, floors, rooms, and attendees
 * 
 * Run with: npm run prisma:seed
 */

import { PrismaClient, ConferenceRole, Gender, RoomType } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // WHY: Clear existing data for clean slate (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.auditLog.deleteMany();
    await prisma.roomAssignment.deleteMany();
    await prisma.attendee.deleteMany();
    await prisma.room.deleteMany();
    await prisma.floor.deleteMany();
    await prisma.building.deleteMany();
    await prisma.autoAssignmentConfig.deleteMany();
    await prisma.conferenceHouse.deleteMany();
  }

  // Create Conference House
  console.log('🏛️  Creating conference house...');
  const conferenceHouse = await prisma.conferenceHouse.create({
    data: {
      name: 'Agape Conference Center',
      description: 'Main conference venue with multiple buildings and accommodation facilities',
    },
  });

  // Create Buildings
  console.log('🏢 Creating buildings...');
  const buildingA = await prisma.building.create({
    data: {
      conferenceHouseId: conferenceHouse.id,
      name: 'Building A - North Wing',
      floorCount: 3,
    },
  });

  const buildingB = await prisma.building.create({
    data: {
      conferenceHouseId: conferenceHouse.id,
      name: 'Building B - South Wing',
      floorCount: 2,
    },
  });

  // Create Floors for Building A
  console.log('📐 Creating floors...');
  const floorsA = await Promise.all([
    prisma.floor.create({
      data: { buildingId: buildingA.id, floorNumber: 1, name: 'First Floor' },
    }),
    prisma.floor.create({
      data: { buildingId: buildingA.id, floorNumber: 2, name: 'Second Floor' },
    }),
    prisma.floor.create({
      data: { buildingId: buildingA.id, floorNumber: 3, name: 'Third Floor' },
    }),
  ]);

  // Create Floors for Building B
  const floorsB = await Promise.all([
    prisma.floor.create({
      data: { buildingId: buildingB.id, floorNumber: 1, name: 'Ground Floor' },
    }),
    prisma.floor.create({
      data: { buildingId: buildingB.id, floorNumber: 2, name: 'Upper Floor' },
    }),
  ]);

  // Create Rooms
  console.log('🚪 Creating rooms...');
  const rooms: { floorId: string; roomNumber: string; capacity: number; type: RoomType }[] = [];

  // Building A - Floor 1: Rooms 101-110 (double rooms)
  for (let i = 1; i <= 10; i++) {
    rooms.push({
      floorId: floorsA[0]!.id,
      roomNumber: `10${i}`,
      capacity: 2,
      type: RoomType.DOUBLE,
    });
  }

  // Building A - Floor 2: Rooms 201-210 (single and double mix)
  for (let i = 1; i <= 5; i++) {
    rooms.push({
      floorId: floorsA[1]!.id,
      roomNumber: `20${i}`,
      capacity: 1,
      type: RoomType.SINGLE,
    });
  }
  for (let i = 6; i <= 10; i++) {
    rooms.push({
      floorId: floorsA[1]!.id,
      roomNumber: `20${i}`,
      capacity: 2,
      type: RoomType.DOUBLE,
    });
  }

  // Building A - Floor 3: Rooms 301-305 (suites)
  for (let i = 1; i <= 5; i++) {
    rooms.push({
      floorId: floorsA[2]!.id,
      roomNumber: `30${i}`,
      capacity: 4,
      type: RoomType.SUITE,
    });
  }

  // Building B - Floor 1: Rooms B101-B110
  for (let i = 1; i <= 10; i++) {
    rooms.push({
      floorId: floorsB[0]!.id,
      roomNumber: `B10${i}`,
      capacity: 2,
      type: RoomType.DOUBLE,
    });
  }

  // Building B - Floor 2: Rooms B201-B205
  for (let i = 1; i <= 5; i++) {
    rooms.push({
      floorId: floorsB[1]!.id,
      roomNumber: `B20${i}`,
      capacity: 3,
      type: RoomType.SUITE,
    });
  }

  await Promise.all(
    rooms.map((room) =>
      prisma.room.create({
        data: {
          floorId: room.floorId,
          roomNumber: room.roomNumber,
          capacity: room.capacity,
          roomType: room.type,
          amenities: ['AC', 'WiFi'],
        },
      })
    )
  );

  // Create Sample Attendees
  console.log('👥 Creating attendees...');
  const attendees = [
    {
      fullName: 'John Smith',
      phone: '+1-555-0101',
      email: 'john.smith@example.com',
      age: 45,
      gender: Gender.MALE,
      church: 'First Baptist Church',
      conferenceRole: ConferenceRole.LEADER,
      notes: 'Conference speaker',
    },
    {
      fullName: 'Sarah Johnson',
      phone: '+1-555-0102',
      email: 'sarah.j@example.com',
      age: 38,
      gender: Gender.FEMALE,
      church: 'Grace Community Church',
      conferenceRole: ConferenceRole.PASTOR,
      notes: 'Workshop facilitator',
    },
    {
      fullName: 'Michael Brown',
      phone: '+1-555-0103',
      email: 'michael.b@example.com',
      age: 52,
      gender: Gender.MALE,
      church: 'Trinity Fellowship',
      conferenceRole: ConferenceRole.VIP,
      notes: 'Guest speaker, needs accessible room',
    },
    {
      fullName: 'Emily Davis',
      phone: '+1-555-0104',
      email: 'emily.d@example.com',
      age: 29,
      gender: Gender.FEMALE,
      church: 'New Life Church',
      conferenceRole: ConferenceRole.ATTENDEE,
    },
    {
      fullName: 'David Wilson',
      phone: '+1-555-0105',
      email: 'david.w@example.com',
      age: 41,
      gender: Gender.MALE,
      church: 'Hope Church',
      conferenceRole: ConferenceRole.ATTENDEE,
    },
    {
      fullName: 'Lisa Martinez',
      phone: '+1-555-0106',
      email: 'lisa.m@example.com',
      age: 35,
      gender: Gender.FEMALE,
      church: 'Faith Community',
      conferenceRole: ConferenceRole.STAFF,
      notes: 'Conference coordinator',
    },
    // Add some attendees with Arabic names for internationalization testing
    {
      fullName: 'أحمد محمد',
      phone: '+20-555-0201',
      email: 'ahmed.m@example.com',
      age: 33,
      gender: Gender.MALE,
      church: 'كنيسة النعمة',
      conferenceRole: ConferenceRole.ATTENDEE,
    },
    {
      fullName: 'فاطمة علي',
      phone: '+20-555-0202',
      email: 'fatima.a@example.com',
      age: 28,
      gender: Gender.FEMALE,
      church: 'كنيسة الرجاء',
      conferenceRole: ConferenceRole.ATTENDEE,
    },
  ];

  await Promise.all(
    attendees.map((attendee) =>
      prisma.attendee.create({
        data: attendee,
      })
    )
  );

  // Create Auto-Assignment Configuration
  console.log('⚙️  Creating auto-assignment configuration...');
  await prisma.autoAssignmentConfig.create({
    data: {
      conferenceHouseId: conferenceHouse.id,
      enabledBuildings: [buildingA.id, buildingB.id],
      staffReservedCapacity: 5,
      vipReservedCapacity: 10,
      emergencyReservedCapacity: 3,
      enabledRules: [
        'room_capacity',
        'gender_match',
        'room_type_match',
        'room_availability',
        'building_enabled',
        'same_church',
        'same_governorate',
        'minimize_empty_beds'
      ],
      ruleWeights: {
        same_church: 0.3,
        same_governorate: 0.2,
        similar_age: 0.1,
        minimize_empty_beds: 0.2,
        prefer_same_floor: 0.1,
        leader_proximity: 0.1
      },
      optimizationEnabled: true
    }
  });

  console.log('✅ Seed completed successfully!');
  console.log(`   - Created 1 conference house`);
  console.log(`   - Created 2 buildings`);
  console.log(`   - Created 5 floors`);
  console.log(`   - Created ${rooms.length} rooms`);
  console.log(`   - Created ${attendees.length} attendees`);
  console.log(`   - Created 1 auto-assignment configuration`);
  console.log('\n🚀 Database is ready for development!');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
