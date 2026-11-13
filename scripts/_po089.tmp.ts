import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

;(async () => {
  const po = await db.purchaseOrder.findFirst({ 
    where: { poNumber: 'PO-202607-089' }, 
    select: { 
      id: true, 
      status: true, 
      createdAt: true, 
      deliveryLocationId: true, 
      items: { 
        select: { 
          itemId: true, 
          orderedQty: true, 
          receivedQty: true, 
          item: { select: { name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true } } 
        } 
      } 
    } 
  })

  // 1. Cek dulu apakah PO-nya benar-benar ada di database
  if (!po) {
    console.log("Purchase Order dengan nomor PO-202607-089 tidak ditemukan.")
    return
  }

  console.log(JSON.stringify(po, null, 1))

  const grs = await db.goodsReceipt.findMany({ 
    where: { orderId: po.id }, // Tidak perlu pakai '!' lagi karena sudah dicek di atas
    select: { id: true, grNumber: true, locationId: true, receivedAt: true, createdAt: true, items: { select: { itemId: true, receivedQty: true } } } 
  })
  console.log(JSON.stringify(grs, null, 1))

  for (const it of po.items) {
    const mv = await db.stockMovement.findMany({ 
      where: { 
        itemId: it.itemId, 
        OR: [
          { fromLocationId: po.deliveryLocationId ?? undefined }, 
          { toLocationId: po.deliveryLocationId ?? undefined }
        ] 
      }, 
      orderBy: { createdAt: 'asc' }, 
      select: { id: true, type: true, quantity: true, createdAt: true, referenceType: true, referenceId: true, fromLocationId: true, toLocationId: true, notes: true } 
    })

    // 2. Gunakan 'it.item?.name' untuk menghindari error TypeScript 'possibly null'
    console.log(it.item?.name ?? 'Unknown Item', mv.length)
    
    for (const m of mv) {
      console.log(
        m.createdAt.toISOString(), 
        m.type, 
        m.quantity, 
        m.referenceType, 
        m.referenceId, 
        m.fromLocationId === po.deliveryLocationId ? 'from' : '', 
        m.toLocationId === po.deliveryLocationId ? 'to' : '', 
        m.notes ?? ''
      )
    }

    const lots = await db.stockLot.findMany({ 
      where: { 
        itemId: it.itemId, 
        locationId: po.deliveryLocationId ?? undefined 
      }, 
      select: { quantity: true } 
    })
    console.log('lots', lots)
  }
})()
.catch((e) => {
  console.error(e)
})
.finally(async () => {
  await db.$disconnect()
})