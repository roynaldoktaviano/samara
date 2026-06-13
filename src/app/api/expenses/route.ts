import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

async function requireFinance() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string })?.role ?? ''
  if (!['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(role)) return null
  return session
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireFinance()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const yachtId = searchParams.get('yachtId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {}
    if (category) where.category = category
    if (yachtId) where.yachtId = yachtId
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(endDate)
    }

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: 'desc' }
    })

    return NextResponse.json(expenses)
  } catch (error) {
    console.error('Error fetching expenses:', error)
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireFinance()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const {
      category,
      amount,
      description,
      yachtId,
      bookingId,
      date
    } = body

    if (!category || !amount) {
      return NextResponse.json(
        { error: 'Category and amount are required' },
        { status: 400 }
      )
    }

    const expense = await db.expense.create({
      data: {
        category,
        amount: parseFloat(amount),
        description,
        yachtId,
        bookingId,
        date: date ? new Date(date) : new Date()
      }
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Error creating expense:', error)
    return NextResponse.json(
      { error: 'Failed to create expense' },
      { status: 500 }
    )
  }
}
