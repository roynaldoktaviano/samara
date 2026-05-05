import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const guests = await db.guest.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(guests)
  } catch (error) {
    console.error('Error fetching guests:', error)
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, email, idNumber, nationality } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const guest = await db.guest.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        idNumber: idNumber || null,
        nationality: nationality || null,
      },
    })

    return NextResponse.json(guest, { status: 201 })
  } catch (error) {
    console.error('Error creating guest:', error)
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
  }
}
