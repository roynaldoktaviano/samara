import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // Create users with different roles
  const hashedPassword = await bcrypt.hash('samara123', 10)

  await Promise.all([
    prisma.user.upsert({
      where: { email: 'superadmin@samara.com' },
      update: {},
      create: {
        email: 'superadmin@samara.com',
        name: 'Super Admin',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      },
    }),
    prisma.user.upsert({
      where: { email: 'admin@samara.com' },
      update: {},
      create: {
        email: 'admin@samara.com',
        name: 'Admin Samara',
        password: hashedPassword,
        role: 'ADMIN',
      },
    }),
    prisma.user.upsert({
      where: { email: 'manager@samara.com' },
      update: {},
      create: {
        email: 'manager@samara.com',
        name: 'Manager Ops',
        password: hashedPassword,
        role: 'MANAGER',
      },
    }),
    prisma.user.upsert({
      where: { email: 'staff@samara.com' },
      update: {},
      create: {
        email: 'staff@samara.com',
        name: 'Staff Reservasi',
        password: hashedPassword,
        role: 'STAFF',
      },
    }),
  ])

  console.log('Created 4 users (password: samara123 for all)')

  // Create customers
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { id: 'customer-1' },
      update: {},
      create: {
        id: 'customer-1',
        name: 'John Smith',
        email: 'john.smith@example.com',
        phone: '+1 234-567-8900',
        address: '123 Ocean Drive, Miami, FL',
        companyName: 'Smith Enterprises',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-2' },
      update: {},
      create: {
        id: 'customer-2',
        name: 'Sarah Johnson',
        email: 'sarah.j@example.com',
        phone: '+1 234-567-8901',
        address: '456 Beach Blvd, San Diego, CA',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-3' },
      update: {},
      create: {
        id: 'customer-3',
        name: 'Mike Wilson',
        email: 'mike.wilson@example.com',
        phone: '+1 234-567-8902',
        address: '789 Harbor St, Newport, RI',
        companyName: 'Wilson Corp',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-4' },
      update: {},
      create: {
        id: 'customer-4',
        name: 'Emma Davis',
        email: 'emma.davis@example.com',
        phone: '+1 234-567-8903',
        address: '321 Marina Way, Fort Lauderdale, FL',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-5' },
      update: {},
      create: {
        id: 'customer-5',
        name: 'Robert Brown',
        email: 'robert.brown@example.com',
        phone: '+1 234-567-8904',
        address: '654 Bay Ave, Tampa, FL',
        companyName: 'Brown & Co',
      },
    }),
  ])

  console.log(`Created ${customers.length} customers`)

  // Create yachts
  const yachts = await Promise.all([
    prisma.yacht.upsert({
      where: { id: 'yacht-1' },
      update: {},
      create: {
        id: 'yacht-1',
        name: 'Samara I',
        model: 'Custom Phinisi',
        year: 2017,
        capacity: 12,
        cabins: 5,
        length: 27.0,
        hourlyRate: 350,
        dailyRate: 3500,
        status: 'available',
        description: 'Traditional luxury Phinisi perfect for intimate explorations and liveaboard experiences.',
      },
    }),
    prisma.yacht.upsert({
      where: { id: 'yacht-2' },
      update: {},
      create: {
        id: 'yacht-2',
        name: 'Samara II',
        model: 'Custom Phinisi',
        year: 2018,
        capacity: 10,
        cabins: 4,
        length: 24.0,
        hourlyRate: 300,
        dailyRate: 3000,
        status: 'available',
        description: 'Boutique Phinisi designed for unforgettable voyages and diving trips.',
      },
    }),
    prisma.yacht.upsert({
      where: { id: 'yacht-3' },
      update: {},
      create: {
        id: 'yacht-3',
        name: 'Mischief',
        model: 'Luxury Phinisi',
        year: 2015,
        capacity: 8,
        cabins: 3,
        length: 30.0,
        hourlyRate: 500,
        dailyRate: 5500,
        status: 'booked',
        description: 'Eco-friendly luxury yacht blending traditional style with striking contemporary lines.',
      },
    }),
    prisma.yacht.upsert({
      where: { id: 'yacht-4' },
      update: {},
      create: {
        id: 'yacht-4',
        name: 'Otium',
        model: 'Luxury Motor Yacht',
        year: 2022,
        capacity: 14,
        cabins: 5,
        length: 35.0,
        hourlyRate: 800,
        dailyRate: 7000,
        status: 'available',
        description: 'Premium modern luxury and comfort for the ultimate sea getaway.',
      },
    }),
  ])

  console.log(`Created ${yachts.length} yachts`)

  // Create crew members
  await Promise.all([
    prisma.crew.upsert({
      where: { id: 'crew-1' },
      update: {},
      create: {
        id: 'crew-1',
        yachtId: yachts[0].id,
        name: 'Captain James Miller',
        position: 'Captain',
        phone: '+1 555-0001',
        email: 'captain.miller@example.com',
      },
    }),
    prisma.crew.upsert({
      where: { id: 'crew-2' },
      update: {},
      create: {
        id: 'crew-2',
        yachtId: yachts[0].id,
        name: 'Alice Chen',
        position: 'Chef',
        phone: '+1 555-0002',
        email: 'alice.chef@example.com',
      },
    }),
    prisma.crew.upsert({
      where: { id: 'crew-3' },
      update: {},
      create: {
        id: 'crew-3',
        yachtId: yachts[1].id,
        name: 'Captain Robert Taylor',
        position: 'Captain',
        phone: '+1 555-0003',
        email: 'captain.taylor@example.com',
      },
    }),
    prisma.crew.upsert({
      where: { id: 'crew-4' },
      update: {},
      create: {
        id: 'crew-4',
        yachtId: yachts[1].id,
        name: 'Maria Garcia',
        position: 'Stewardess',
        phone: '+1 555-0004',
        email: 'maria.steward@example.com',
      },
    }),
  ])

  console.log('Created crew members')

  // Create bookings
  const bookings = await Promise.all([
    prisma.booking.upsert({
      where: { bookingCode: 'BK001' },
      update: {},
      create: {
        bookingCode: 'BK001',
        yachtId: yachts[0].id,
        customerId: customers[0].id,
        startDate: new Date('2025-02-15'),
        endDate: new Date('2025-02-17'),
        totalPrice: 7000,
        depositPaid: 3500,
        status: 'confirmed',
      },
    }),
    prisma.booking.upsert({
      where: { bookingCode: 'BK002' },
      update: {},
      create: {
        bookingCode: 'BK002',
        yachtId: yachts[1].id,
        customerId: customers[1].id,
        startDate: new Date('2025-02-20'),
        endDate: new Date('2025-02-22'),
        totalPrice: 11000,
        depositPaid: 5500,
        status: 'pending',
      },
    }),
    prisma.booking.upsert({
      where: { bookingCode: 'BK003' },
      update: {},
      create: {
        bookingCode: 'BK003',
        yachtId: yachts[2].id,
        customerId: customers[2].id,
        startDate: new Date('2025-02-10'),
        endDate: new Date('2025-02-12'),
        totalPrice: 5000,
        depositPaid: 5000,
        status: 'completed',
      },
    }),
    prisma.booking.upsert({
      where: { bookingCode: 'BK004' },
      update: {},
      create: {
        bookingCode: 'BK004',
        yachtId: yachts[3].id,
        customerId: customers[3].id,
        startDate: new Date('2025-02-25'),
        endDate: new Date('2025-02-28'),
        totalPrice: 19500,
        depositPaid: 9750,
        status: 'confirmed',
      },
    }),
    prisma.booking.upsert({
      where: { bookingCode: 'BK005' },
      update: {},
      create: {
        bookingCode: 'BK005',
        yachtId: yachts[0].id,
        customerId: customers[4].id,
        startDate: new Date('2025-02-05'),
        endDate: new Date('2025-02-06'),
        totalPrice: 3500,
        depositPaid: 0,
        status: 'cancelled',
      },
    }),
  ])

  console.log(`Created ${bookings.length} bookings`)

  // Create expenses
  await Promise.all([
    prisma.expense.upsert({
      where: { id: 'expense-1' },
      update: {},
      create: {
        id: 'expense-1',
        category: 'Fuel',
        amount: 1250,
        description: 'Refuel for Samara I',
        yachtId: yachts[0].id,
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-2' },
      update: {},
      create: {
        id: 'expense-2',
        category: 'Maintenance',
        amount: 3500,
        description: 'Engine repair - Samara II',
        yachtId: yachts[1].id,
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-3' },
      update: {},
      create: {
        id: 'expense-3',
        category: 'Crew Salary',
        amount: 15000,
        description: 'Monthly crew salaries',
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-4' },
      update: {},
      create: {
        id: 'expense-4',
        category: 'Supplies',
        amount: 850,
        description: 'Food and beverages provisioning',
        yachtId: yachts[2].id,
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-5' },
      update: {},
      create: {
        id: 'expense-5',
        category: 'Insurance',
        amount: 2500,
        description: 'Monthly insurance premium',
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-6' },
      update: {},
      create: {
        id: 'expense-6',
        category: 'Docking',
        amount: 1200,
        description: 'Monthly docking fees',
      },
    }),
    prisma.expense.upsert({
      where: { id: 'expense-7' },
      update: {},
      create: {
        id: 'expense-7',
        category: 'Cleaning',
        amount: 450,
        description: 'Deep cleaning - Otium',
        yachtId: yachts[3].id,
      },
    }),
  ])

  console.log('Created expenses')

  // Create maintenance tasks
  await Promise.all([
    prisma.maintenance.upsert({
      where: { id: 'maint-1' },
      update: {},
      create: {
        id: 'maint-1',
        yachtId: yachts[0].id,
        title: 'Engine Oil Change',
        description: 'Regular oil change for the main engine',
        scheduledDate: new Date('2025-02-15'),
        status: 'scheduled',
        cost: 450,
      },
    }),
    prisma.maintenance.upsert({
      where: { id: 'maint-2' },
      update: {},
      create: {
        id: 'maint-2',
        yachtId: yachts[1].id,
        title: 'Hull Inspection',
        description: 'Annual hull inspection and cleaning',
        scheduledDate: new Date('2025-02-10'),
        completedAt: new Date('2025-02-10'),
        status: 'completed',
        cost: 1200,
      },
    }),
    prisma.maintenance.upsert({
      where: { id: 'maint-3' },
      update: {},
      create: {
        id: 'maint-3',
        yachtId: yachts[2].id,
        title: 'Navigation System Update',
        description: 'Update GPS and navigation charts',
        scheduledDate: new Date('2025-02-20'),
        status: 'in-progress',
        cost: 350,
      },
    }),
    prisma.maintenance.upsert({
      where: { id: 'maint-4' },
      update: {},
      create: {
        id: 'maint-4',
        yachtId: yachts[3].id,
        title: 'AC System Repair',
        description: 'Fix malfunctioning air conditioning in cabin 2',
        scheduledDate: new Date('2025-02-25'),
        status: 'scheduled',
        cost: 800,
      },
    }),
    prisma.maintenance.upsert({
      where: { id: 'maint-5' },
      update: {},
      create: {
        id: 'maint-5',
        yachtId: yachts[0].id,
        title: 'Safety Equipment Check',
        description: 'Monthly safety equipment inspection',
        scheduledDate: new Date('2025-02-05'),
        completedAt: new Date('2025-02-05'),
        status: 'completed',
        cost: 200,
      },
    }),
  ])

  console.log('Created maintenance tasks')
  console.log('\nSeed completed successfully!')
  console.log('\n--- Login credentials ---')
  console.log('superadmin@samara.com  | samara123 | SUPER_ADMIN (all menus)')
  console.log('admin@samara.com       | samara123 | ADMIN (all menus)')
  console.log('manager@samara.com     | samara123 | MANAGER (Dashboard, Bookings, Customers, Statistics)')
  console.log('staff@samara.com       | samara123 | STAFF (Dashboard, Bookings)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
