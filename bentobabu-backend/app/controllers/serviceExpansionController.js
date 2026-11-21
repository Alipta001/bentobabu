const mongoose = require('mongoose');
const { ServiceExpansionVote, DeliveryZone } = require('../models');

/**
 * Class-based Controller for Service Area Expansion Voting System
 */
class ServiceExpansionController {
  /**
   * POST /api/v1/service-expansion/vote
   * Customer: Record a vote for an unsupported delivery location
   */
  static async vote(req, res, next) {
    try {
      const {
        pincode,
        locality,
        city,
        state,
        anonymousIdentifier,
        customerName,
        customerPhone,
        source,
      } = req.body;

      if (!pincode || typeof pincode !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Please provide a 6-digit postal PIN code',
        });
      }

      const cleanPin = pincode.trim();
      if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid 6-digit Indian postal PIN code (e.g., 700122)',
        });
      }

      // 1. Verify that the location is not already serviceable
      const activeZone = await DeliveryZone.findOne({
        pincodes: cleanPin,
        isActive: true,
        isDeleted: { $ne: true },
      });

      if (activeZone) {
        return res.status(400).json({
          success: false,
          alreadyServiceable: true,
          message: `Good news! PIN code ${cleanPin} is already within our active delivery zone (${activeZone.name}). You can order directly!`,
        });
      }

      // 2. Identify voter (Customer ID if authenticated or Anonymous Identifier)
      const customerId = req.user?._id || null;
      let anonId = (anonymousIdentifier || '').trim();

      if (!customerId && !anonId) {
        // Fallback anonymous identifier using IP and User-Agent hash
        const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'guest';
        const userAgent = req.headers['user-agent'] || 'browser';
        anonId = `anon_${Buffer.from(`${rawIp}_${userAgent}`).toString('base64').substring(0, 24)}`;
      }

      // 3. Concurrency-safe deduplication / idempotent voting
      // Prevent vote inflation when a guest votes and subsequently logs in (or logs out)
      let existingVote = null;

      if (customerId) {
        // Authenticated voter: check by customer ID first, then by anonymous identifier
        existingVote = await ServiceExpansionVote.findOne({ pincode: cleanPin, customer: customerId });
        if (!existingVote && anonId) {
          existingVote = await ServiceExpansionVote.findOne({ pincode: cleanPin, anonymousIdentifier: anonId });
          if (existingVote) {
            // Claim/link existing guest vote to this authenticated customer
            existingVote.customer = customerId;
          }
        }
      } else {
        // Guest voter: check by anonymous identifier
        existingVote = await ServiceExpansionVote.findOne({ pincode: cleanPin, anonymousIdentifier: anonId });
      }

      if (existingVote) {
        // Update vote metadata idempotently without inflating count
        if (locality && locality.trim()) existingVote.locality = locality.trim();
        if (city && city.trim()) existingVote.city = city.trim();
        if (state && state.trim()) existingVote.state = state.trim();
        if (customerName && customerName.trim()) existingVote.customerName = customerName.trim();
        if (customerPhone && customerPhone.trim()) existingVote.customerPhone = customerPhone.trim();
        if (anonId && !existingVote.anonymousIdentifier) existingVote.anonymousIdentifier = anonId;
        await existingVote.save();

        return res.status(200).json({
          success: true,
          alreadyVoted: true,
          message: "Thank you for your support! ❤️ Your vote has been recorded. We'll consider your area as we expand BentoBabu.",
          data: {
            id: existingVote._id,
            pincode: existingVote.pincode,
            locality: existingVote.locality,
            city: existingVote.city,
            state: existingVote.state,
            status: existingVote.status,
          },
        });
      }

      // 4. Create new vote record
      const newVote = await ServiceExpansionVote.create({
        pincode: cleanPin,
        locality: (locality || '').trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        customer: customerId || null,
        anonymousIdentifier: anonId || null,
        customerName: customerName ? customerName.trim() : (req.user?.name || ''),
        customerPhone: customerPhone ? customerPhone.trim() : (req.user?.phone || ''),
        source: source || 'CHECKOUT_UNSERVICEABLE',
      });

      return res.status(201).json({
        success: true,
        alreadyVoted: false,
        message: "Thank you for your support! ❤️ Your vote has been recorded. We'll consider your area as we expand BentoBabu.",
        data: {
          id: newVote._id,
          pincode: newVote.pincode,
          locality: newVote.locality,
          city: newVote.city,
          state: newVote.state,
          status: newVote.status,
        },
      });
    } catch (error) {
      // Handle MongoDB duplicate key error gracefully
      if (error.code === 11000) {
        return res.status(200).json({
          success: true,
          alreadyVoted: true,
          message: "Thank you for your support! ❤️ Your vote has been recorded. We'll consider your area as we expand BentoBabu.",
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/service-expansion/summary
   * Admin: Summary metrics for Service Expansion
   */
  static async getSummary(req, res, next) {
    try {
      const now = new Date();
      const periodDays = parseInt(req.query.periodDays, 10) || 30;
      const periodStartDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

      const [totalVotes, uniquePinsList, newVotesInPeriod, topRequestedAreaAgg] = await Promise.all([
        ServiceExpansionVote.countDocuments(),
        ServiceExpansionVote.distinct('pincode'),
        ServiceExpansionVote.countDocuments({ createdAt: { $gte: periodStartDate } }),
        ServiceExpansionVote.aggregate([
          {
            $group: {
              _id: '$pincode',
              totalVotes: { $sum: 1 },
              locality: { $first: '$locality' },
              city: { $first: '$city' },
              state: { $first: '$state' },
              status: { $first: '$status' },
            },
          },
          { $sort: { totalVotes: -1 } },
          { $limit: 1 },
        ]),
      ]);

      const topRequestedArea = topRequestedAreaAgg[0]
        ? {
            pincode: topRequestedAreaAgg[0]._id,
            locality: topRequestedAreaAgg[0].locality || '',
            city: topRequestedAreaAgg[0].city || '',
            state: topRequestedAreaAgg[0].state || '',
            votes: topRequestedAreaAgg[0].totalVotes,
            status: topRequestedAreaAgg[0].status || 'NEW',
          }
        : null;

      res.status(200).json({
        success: true,
        data: {
          totalVotes,
          uniquePincodesCount: uniquePinsList.length,
          newVotesInPeriod,
          periodDays,
          topRequestedArea,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/service-expansion/locations
   * Admin: Ranked list of requested locations with filtering, search, pagination
   */
  static async getLocations(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;

      const { search, status, sortBy = 'votes', sortOrder = 'desc' } = req.query;

      const matchStage = {};

      if (status && status !== 'ALL') {
        matchStage.status = status.toUpperCase();
      }

      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        matchStage.$or = [
          { pincode: regex },
          { locality: regex },
          { city: regex },
          { state: regex },
        ];
      }

      const sortDirection = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
      let sortStage = { totalVotes: sortDirection, lastVotedAt: -1 };

      if (sortBy === 'pincode') {
        sortStage = { _id: sortDirection };
      } else if (sortBy === 'lastVotedAt') {
        sortStage = { lastVotedAt: sortDirection };
      }

      const aggregatePipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: '$pincode',
            totalVotes: { $sum: 1 },
            locality: { $first: '$locality' },
            city: { $first: '$city' },
            state: { $first: '$state' },
            status: { $last: '$status' },
            internalNotes: { $last: '$internalNotes' },
            firstVotedAt: { $min: '$createdAt' },
            lastVotedAt: { $max: '$updatedAt' },
          },
        },
        { $sort: sortStage },
      ];

      const [countResult, locations] = await Promise.all([
        ServiceExpansionVote.aggregate([...aggregatePipeline, { $count: 'total' }]),
        ServiceExpansionVote.aggregate([
          ...aggregatePipeline,
          { $skip: skip },
          { $limit: limit },
        ]),
      ]);

      const totalItems = countResult[0]?.total || 0;
      const totalPages = Math.ceil(totalItems / limit);

      const formattedLocations = locations.map((loc, idx) => ({
        rank: skip + idx + 1,
        pincode: loc._id,
        locality: loc.locality || '',
        city: loc.city || '',
        state: loc.state || '',
        votes: loc.totalVotes,
        status: loc.status || 'NEW',
        internalNotes: loc.internalNotes || '',
        firstVotedAt: loc.firstVotedAt,
        lastVotedAt: loc.lastVotedAt,
      }));

      res.status(200).json({
        success: true,
        data: {
          locations: formattedLocations,
          pagination: {
            page,
            limit,
            totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/service-expansion/locations/:id
   * Admin: Get location details by PIN code or document ID
   */
  static async getLocationById(req, res, next) {
    try {
      const { id } = req.params;

      let pincode = id;
      if (mongoose.Types.ObjectId.isValid(id)) {
        const doc = await ServiceExpansionVote.findById(id).lean();
        if (doc) pincode = doc.pincode;
      }

      const votes = await ServiceExpansionVote.find({ pincode })
        .populate('customer', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (!votes.length) {
        return res.status(404).json({
          success: false,
          message: 'Location not found in expansion votes',
        });
      }

      const first = votes[0];
      const summary = {
        pincode,
        locality: first.locality || '',
        city: first.city || '',
        state: first.state || '',
        status: first.status || 'NEW',
        internalNotes: first.internalNotes || '',
        totalVotes: votes.length,
        firstVotedAt: votes[votes.length - 1].createdAt,
        lastVotedAt: first.updatedAt || first.createdAt,
      };

      const recentVotes = votes.slice(0, 20).map((v) => ({
        id: v._id,
        customerName: v.customer?.name || v.customerName || 'Guest User',
        customerPhone: v.customer?.phone || (v.customerPhone ? v.customerPhone.replace(/.(?=.{4})/g, '*') : 'N/A'),
        votedAt: v.createdAt,
        source: v.source,
      }));

      res.status(200).json({
        success: true,
        data: {
          location: summary,
          recentVotes,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/service-expansion/locations/:id/status
   * Admin: Update expansion status and internal notes
   */
  static async updateLocationStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, internalNotes } = req.body;

      const validStatuses = ['NEW', 'UNDER_CONSIDERATION', 'PLANNED', 'LAUNCHED', 'REJECTED'];

      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      let pincode = id;
      if (mongoose.Types.ObjectId.isValid(id)) {
        const doc = await ServiceExpansionVote.findById(id).lean();
        if (doc) pincode = doc.pincode;
      }

      const updateFields = {};
      if (status) updateFields.status = status;
      if (typeof internalNotes === 'string') updateFields.internalNotes = internalNotes.trim();

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide status or internalNotes to update',
        });
      }

      const result = await ServiceExpansionVote.updateMany(
        { pincode },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'No votes found for the specified PIN code',
        });
      }

      res.status(200).json({
        success: true,
        message: `Successfully updated ${result.modifiedCount} vote record(s) for PIN ${pincode}`,
        data: {
          pincode,
          ...updateFields,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/service-expansion/export
   * Admin: Export ranked service expansion locations to CSV
   */
  static async exportLocations(req, res, next) {
    try {
      const locations = await ServiceExpansionVote.aggregate([
        {
          $group: {
            _id: '$pincode',
            totalVotes: { $sum: 1 },
            locality: { $first: '$locality' },
            city: { $first: '$city' },
            state: { $first: '$state' },
            status: { $last: '$status' },
            internalNotes: { $last: '$internalNotes' },
            firstVotedAt: { $min: '$createdAt' },
            lastVotedAt: { $max: '$updatedAt' },
          },
        },
        { $sort: { totalVotes: -1, lastVotedAt: -1 } },
      ]);

      const headers = ['Rank', 'PIN Code', 'Locality', 'City', 'State', 'Votes', 'Status', 'Internal Notes', 'First Voted', 'Last Voted'];
      const rows = locations.map((loc, idx) => [
        idx + 1,
        loc._id,
        `"${(loc.locality || '').replace(/"/g, '""')}"`,
        `"${(loc.city || '').replace(/"/g, '""')}"`,
        `"${(loc.state || '').replace(/"/g, '""')}"`,
        loc.totalVotes,
        loc.status || 'NEW',
        `"${(loc.internalNotes || '').replace(/"/g, '""')}"`,
        loc.firstVotedAt ? new Date(loc.firstVotedAt).toISOString() : '',
        loc.lastVotedAt ? new Date(loc.lastVotedAt).toISOString() : '',
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bentobabu-service-expansion-votes-${Date.now()}.csv"`);
      return res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ServiceExpansionController;
