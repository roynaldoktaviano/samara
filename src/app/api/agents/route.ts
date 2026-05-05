import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const agents = await db.agent.findMany({
      where: { isActive: true },
      include: { _count: { select: { bookings: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, phone, company, commission } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const agent = await db.agent.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        commission: commission ? parseFloat(commission) : 0,
      },
    })

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
