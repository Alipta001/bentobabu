/**
 * Socket.IO real-time event dispatcher
 * Safely broadcasts real-time order lifecycle events across customer, rider, and admin rooms.
 */

function getIoInstance(appOrReq) {
  if (appOrReq) {
    if (typeof appOrReq.get === 'function') {
      const io = appOrReq.get('io');
      if (io) return io;
    }
    if (appOrReq.app && typeof appOrReq.app.get === 'function') {
      const io = appOrReq.app.get('io');
      if (io) return io;
    }
  }
  if (typeof global !== 'undefined' && global.io) {
    return global.io;
  }
  return null;
}

/**
 * Emit order lifecycle event to relevant socket rooms
 * @param {Object} appOrReq - Express req or app object
 * @param {string} eventName - Socket event name (e.g. 'order:status_updated', 'order:rider_accepted')
 * @param {Object} payload - Event payload
 */
function emitOrderEvent(appOrReq, eventName, payload = {}) {
  try {
    const io = getIoInstance(appOrReq);
    if (!io) {
      return false;
    }

    const { orderId, orderNumber, status, userId, assignedDeliveryPartner } = payload;

    // 1. Broadcast to specific order room
    if (orderId) {
      io.to(`order:${orderId}`).emit(eventName, payload);
    }

    // 2. Broadcast to customer room
    if (userId) {
      io.to(`user:${userId}`).emit(eventName, payload);
    }

    // 3. Broadcast to rider room
    if (assignedDeliveryPartner) {
      io.to(`rider:${assignedDeliveryPartner}`).emit(eventName, payload);
    }

    // 4. If request is ready for dispatch/pickup, notify all available riders
    if (eventName === 'delivery:request_available' || status === 'READY_FOR_PICKUP' || status === 'READY_FOR_DISPATCH') {
      io.to('riders:available').emit('delivery:request_available', payload);
    }

    // 5. Broadcast to admin and kitchen operation channels
    io.to('admin:orders').emit(eventName, payload);

    return true;
  } catch (err) {
    console.error(`[SocketService] Error emitting event "${eventName}":`, err.message);
    return false;
  }
}

module.exports = {
  getIoInstance,
  emitOrderEvent,
};
