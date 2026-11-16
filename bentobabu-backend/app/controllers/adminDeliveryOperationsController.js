const mongoose = require('mongoose');
const {
  User,
  DeliveryApplication,
  DeliveryPartnerPresence,
  Order,
  RefreshSession,
} = require('../models');

const CONNECTION_TIMEOUT_MS = parseInt(process.env.DELIVERY_CONNECTION_TIMEOUT_MS, 10) || 60000;
const LOCATION_FRESH_MS = parseInt(process.env.DELIVERY_LOCATION_FRESH_MS, 10) || 120000;

class AdminDeliveryOperationsController {
  /**
   * Helper: Ensure presence documents exist for all delivery partners
   */
  static async syncAllPresences() {
    const deliveryUsers = await User.find({ role: 'DELIVERY' }).select('_id isActive name').lean();
    if (!deliveryUsers.length) return [];

    const userIds = deliveryUsers.map((u) => u._id);
    const [existingPresences, applications] = await Promise.all([
      DeliveryPartnerPresence.find({ user: { $in: userIds } }),
      DeliveryApplication.find({ user: { $in: userIds } }).select('_id user status vehicleInfo personalInfo').lean(),
    ]);

    const presenceMap = new Map();
    for (const p of existingPresences) {
      presenceMap.set(p.user.toString(), p);
    }

    const appMap = new Map();
    for (const a of applications) {
      appMap.set(a.user.toString(), a);
    }

    const toInsert = [];
    for (const user of deliveryUsers) {
      const uId = user._id.toString();
      const app = appMap.get(uId);
      const calculatedAccountStatus =
        user.isActive === false
          ? app?.status === 'SUSPENDED'
            ? 'SUSPENDED'
            : 'DEACTIVATED'
          : app?.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : 'ACTIVE';

      if (!presenceMap.has(uId)) {
        toInsert.push({
          user: user._id,
          application: app?._id || null,
          accountStatus: calculatedAccountStatus,
          availabilityStatus: 'OFFLINE',
          intendedAvailability: 'OFFLINE',
        });
      } else {
        const pres = presenceMap.get(uId);
        let changed = false;
        if (pres.accountStatus !== calculatedAccountStatus) {
          pres.accountStatus = calculatedAccountStatus;
          if (calculatedAccountStatus !== 'ACTIVE') {
            pres.availabilityStatus = 'OFFLINE';
          }
          changed = true;
        }
        if (!pres.application && app?._id) {
          pres.application = app._id;
          changed = true;
        }
        if (changed) {
          await pres.save();
        }
      }
    }

    if (toInsert.length > 0) {
      const created = await DeliveryPartnerPresence.insertMany(toInsert);
      for (const c of created) {
        presenceMap.set(c.user.toString(), c);
      }
    }

    return deliveryUsers;
  }

  /**
   * GET /api/v1/admin/delivery-operations/overview
   * Overview statistics across the delivery fleet
   */
  static async getOverviewStats(req, res, next) {
    try {
      await AdminDeliveryOperationsController.syncAllPresences();

      const presences = await DeliveryPartnerPresence.find().lean();
      const now = Date.now();

      let totalApproved = 0;
      let online = 0;
      let available = 0;
      let busy = 0;
      let offline = 0;
      let disconnected = 0;
      let suspendedOrDeactivated = 0;

      for (const p of presences) {
        totalApproved++;

        const isAccountActive = p.accountStatus === 'ACTIVE';
        if (!isAccountActive) {
          suspendedOrDeactivated++;
        }

        const heartbeatAge = p.lastHeartbeat ? now - new Date(p.lastHeartbeat).getTime() : Infinity;
        const isConnected = heartbeatAge <= CONNECTION_TIMEOUT_MS;

        if (!isConnected) {
          disconnected++;
        }

        if (p.availabilityStatus === 'ONLINE') {
          online++;
          if (!p.currentOrderId) {
            available++;
          } else {
            busy++;
          }
        } else if (p.availabilityStatus === 'BUSY') {
          busy++;
          online++; // Busy partners are considered part of the active online fleet
        } else {
          offline++;
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          totalApproved,
          online,
          available,
          busy,
          offline,
          disconnected,
          suspendedOrDeactivated,
          activeDeliveriesCount: busy,
          config: {
            heartbeatTimeoutMs: CONNECTION_TIMEOUT_MS,
            locationFreshMs: LOCATION_FRESH_MS,
          },
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/delivery-operations/partners
   * Full list of delivery partners with presence, connection & location data
   */
  static async getPartnersList(req, res, next) {
    try {
      await AdminDeliveryOperationsController.syncAllPresences();

      const {
        search,
        filter = 'ALL',
        sortBy = 'lastSeen',
        sortOrder = 'desc',
        page = 1,
        limit = 50,
      } = req.query;

      // Fetch all delivery users and applications
      const deliveryUsers = await User.find({ role: 'DELIVERY' })
        .select('name email phone profileImage isActive createdAt')
        .lean();

      if (!deliveryUsers.length) {
        return res.status(200).json({
          success: true,
          data: [],
          total: 0,
          page: 1,
          totalPages: 1,
        });
      }

      const userIds = deliveryUsers.map((u) => u._id);
      const [presences, applications, activeOrders] = await Promise.all([
        DeliveryPartnerPresence.find({ user: { $in: userIds } }).lean(),
        DeliveryApplication.find({ user: { $in: userIds } })
          .select('user applicationNumber vehicleInfo status documents.profilePhoto')
          .lean(),
        Order.find({
          assignedDeliveryPartner: { $in: userIds },
          orderStatus: 'OUT_FOR_DELIVERY',
        })
          .select('_id orderNumber orderStatus assignedDeliveryPartner total items deliverySlot deliveryAddress')
          .populate('deliveryAddress', 'houseNo street city landmark')
          .lean(),
      ]);

      const presenceMap = new Map(presences.map((p) => [p.user.toString(), p]));
      const appMap = new Map(applications.map((a) => [a.user.toString(), a]));
      const activeOrderMap = new Map(
        activeOrders.map((o) => [o.assignedDeliveryPartner.toString(), o])
      );

      const now = Date.now();

      // Combine into unified partner records
      let partners = deliveryUsers.map((u) => {
        const uId = u._id.toString();
        const p = presenceMap.get(uId) || {};
        const app = appMap.get(uId) || {};
        const activeOrder = activeOrderMap.get(uId) || null;

        const heartbeatAge = p.lastHeartbeat ? now - new Date(p.lastHeartbeat).getTime() : Infinity;
        const connectionStatus = heartbeatAge <= CONNECTION_TIMEOUT_MS ? 'CONNECTED' : 'DISCONNECTED';

        let locationFreshness = 'NONE';
        if (p.lastLocation && p.lastLocation.latitude && p.lastLocation.longitude) {
          const locAge = p.lastLocation.updatedAt ? now - new Date(p.lastLocation.updatedAt).getTime() : Infinity;
          locationFreshness = locAge <= LOCATION_FRESH_MS ? 'LIVE' : 'LAST_KNOWN';
        }

        const accountStatus =
          p.accountStatus ||
          (u.isActive === false
            ? app.status === 'SUSPENDED'
              ? 'SUSPENDED'
              : 'DEACTIVATED'
            : app.status === 'SUSPENDED'
            ? 'SUSPENDED'
            : 'ACTIVE');

        const availabilityStatus = p.availabilityStatus || 'OFFLINE';

        return {
          id: u._id.toString(),
          name: u.name,
          phone: u.phone,
          email: u.email,
          profilePhoto:
            u.profileImage ||
            app.documents?.profilePhoto?.secureUrl ||
            null,
          applicationNumber: app.applicationNumber || null,
          vehicleInfo: app.vehicleInfo || null,
          accountStatus,
          availabilityStatus,
          connectionStatus,
          locationFreshness,
          currentOrderId: activeOrder ? activeOrder._id.toString() : null,
          currentOrder: activeOrder
            ? {
                id: activeOrder._id.toString(),
                orderNumber: activeOrder.orderNumber,
                status: activeOrder.orderStatus,
                total: activeOrder.total,
                address: activeOrder.deliveryAddress,
              }
            : null,
          lastLocation: p.lastLocation?.latitude
            ? {
                latitude: p.lastLocation.latitude,
                longitude: p.lastLocation.longitude,
                accuracy: p.lastLocation.accuracy,
                heading: p.lastLocation.heading,
                speed: p.lastLocation.speed,
                batteryLevel: p.lastLocation.batteryLevel,
                updatedAt: p.lastLocation.updatedAt,
              }
            : null,
          lastHeartbeat: p.lastHeartbeat || null,
          createdAt: u.createdAt,
        };
      });

      // Search filter (name, phone, email, app number)
      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        partners = partners.filter(
          (partner) =>
            partner.name.toLowerCase().includes(query) ||
            partner.phone.toLowerCase().includes(query) ||
            partner.email.toLowerCase().includes(query) ||
            (partner.applicationNumber && partner.applicationNumber.toLowerCase().includes(query))
        );
      }

      // Status filters
      if (filter && filter !== 'ALL') {
        const upperFilter = filter.toUpperCase();
        partners = partners.filter((partner) => {
          switch (upperFilter) {
            case 'ONLINE':
              return partner.availabilityStatus === 'ONLINE' || partner.availabilityStatus === 'BUSY';
            case 'AVAILABLE':
              return partner.availabilityStatus === 'ONLINE' && !partner.currentOrderId;
            case 'BUSY':
              return partner.availabilityStatus === 'BUSY' || !!partner.currentOrderId;
            case 'OFFLINE':
              return partner.availabilityStatus === 'OFFLINE';
            case 'CONNECTED':
              return partner.connectionStatus === 'CONNECTED';
            case 'DISCONNECTED':
              return partner.connectionStatus === 'DISCONNECTED';
            case 'SUSPENDED':
              return partner.accountStatus === 'SUSPENDED' || partner.accountStatus === 'DEACTIVATED';
            default:
              return true;
          }
        });
      }

      // Sorting
      partners.sort((a, b) => {
        let valA, valB;
        if (sortBy === 'name') {
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortBy === 'status') {
          valA = a.availabilityStatus;
          valB = b.availabilityStatus;
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          // Default: lastSeen (lastHeartbeat or updatedAt)
          valA = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0;
          valB = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
      });

      // Pagination
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const total = partners.length;
      const paginated = partners.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      return res.status(200).json({
        success: true,
        data: paginated,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/delivery-operations/partners/:id
   * Detailed partner view for Partner Details Drawer
   */
  static async getPartnerDetails(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid partner ID format.',
        });
      }

      const [user, presence, application, totalDeliveries, recentDeliveries, activeOrder] =
        await Promise.all([
          User.findById(id).select('name email phone profileImage isActive createdAt').lean(),
          DeliveryPartnerPresence.findOne({ user: id }).lean(),
          DeliveryApplication.findOne({ user: id })
            .select('applicationNumber personalInfo vehicleInfo status documents.profilePhoto')
            .lean(),
          Order.countDocuments({
            assignedDeliveryPartner: id,
            orderStatus: 'DELIVERED',
          }),
          Order.find({
            assignedDeliveryPartner: id,
            orderStatus: 'DELIVERED',
          })
            .sort({ updatedAt: -1 })
            .limit(10)
            .select('_id orderNumber total items orderStatus updatedAt deliveryAddress')
            .populate('deliveryAddress', 'houseNo street city landmark')
            .lean(),
          Order.findOne({
            assignedDeliveryPartner: id,
            orderStatus: 'OUT_FOR_DELIVERY',
          })
            .select('_id orderNumber total items orderStatus createdAt deliveryAddress deliverySlot')
            .populate('deliveryAddress', 'houseNo street city state pincode landmark phone')
            .lean(),
        ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner not found.',
        });
      }

      const now = Date.now();
      const heartbeatAge = presence?.lastHeartbeat
        ? now - new Date(presence.lastHeartbeat).getTime()
        : Infinity;
      const connectionStatus = heartbeatAge <= CONNECTION_TIMEOUT_MS ? 'CONNECTED' : 'DISCONNECTED';

      let locationFreshness = 'NONE';
      if (presence?.lastLocation?.latitude && presence?.lastLocation?.longitude) {
        const locAge = presence.lastLocation.updatedAt
          ? now - new Date(presence.lastLocation.updatedAt).getTime()
          : Infinity;
        locationFreshness = locAge <= LOCATION_FRESH_MS ? 'LIVE' : 'LAST_KNOWN';
      }

      const accountStatus =
        presence?.accountStatus ||
        (user.isActive === false
          ? application?.status === 'SUSPENDED'
            ? 'SUSPENDED'
            : 'DEACTIVATED'
          : application?.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : 'ACTIVE');

      return res.status(200).json({
        success: true,
        data: {
          id: user._id.toString(),
          name: user.name,
          phone: user.phone,
          email: user.email,
          profilePhoto:
            user.profileImage || application?.documents?.profilePhoto?.secureUrl || null,
          applicationNumber: application?.applicationNumber || null,
          vehicleInfo: application?.vehicleInfo || null,
          personalInfo: application
            ? {
                fullName: application.personalInfo?.fullName,
                gender: application.personalInfo?.gender,
                dateOfBirth: application.personalInfo?.dateOfBirth,
              }
            : null,
          accountStatus,
          availabilityStatus: presence?.availabilityStatus || 'OFFLINE',
          connectionStatus,
          locationFreshness,
          lastHeartbeat: presence?.lastHeartbeat || null,
          lastLocation: presence?.lastLocation || null,
          totalDeliveries,
          currentOrder: activeOrder || null,
          recentDeliveries: recentDeliveries.map((o) => ({
            id: o._id.toString(),
            orderNumber: o.orderNumber,
            total: o.total,
            itemCount: o.items?.length || 0,
            deliveredAt: o.updatedAt,
            address: o.deliveryAddress,
          })),
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/delivery-operations/partners/:id/status
   * Administrative suspension or reactivation of a delivery partner
   */
  static async updatePartnerStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { accountStatus, reason } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid partner ID format.',
        });
      }

      const normalizedStatus =
        typeof accountStatus === 'string' ? accountStatus.toUpperCase().trim() : null;

      if (!['ACTIVE', 'SUSPENDED'].includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid accountStatus. Allowed values: "ACTIVE" or "SUSPENDED".',
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner user not found.',
        });
      }

      const [presence, application] = await Promise.all([
        DeliveryPartnerPresence.findOne({ user: id }),
        DeliveryApplication.findOne({ user: id }),
      ]);

      if (normalizedStatus === 'SUSPENDED') {
        user.isActive = false;
        await user.save();

        if (application) {
          application.status = 'SUSPENDED';
          application.rejectionReason = reason ? reason.trim() : 'Account suspended by administrator.';
          application.history.push({
            status: 'SUSPENDED',
            action: 'PARTNER_SUSPENDED',
            performedBy: req.user._id,
            note: reason ? reason.trim() : 'Suspended via Delivery Operations Dashboard.',
            timestamp: new Date(),
          });
          await application.save();
        }

        if (presence) {
          presence.accountStatus = 'SUSPENDED';
          presence.availabilityStatus = 'OFFLINE';
          await presence.save();
        }

        // Revoke active sessions immediately
        await RefreshSession.deleteMany({ user: user._id });
      } else {
        // Reactivating partner
        user.isActive = true;
        await user.save();

        if (application) {
          application.status = 'APPROVED';
          application.rejectionReason = null;
          application.history.push({
            status: 'APPROVED',
            action: 'PARTNER_REACTIVATED',
            performedBy: req.user._id,
            note: reason ? reason.trim() : 'Reactivated via Delivery Operations Dashboard.',
            timestamp: new Date(),
          });
          await application.save();
        }

        if (presence) {
          presence.accountStatus = 'ACTIVE';
          await presence.save();
        }
      }

      return res.status(200).json({
        success: true,
        message: `Delivery partner account has been successfully ${
          normalizedStatus === 'ACTIVE' ? 'reactivated' : 'suspended'
        }.`,
        data: {
          id: user._id.toString(),
          accountStatus: normalizedStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminDeliveryOperationsController;
