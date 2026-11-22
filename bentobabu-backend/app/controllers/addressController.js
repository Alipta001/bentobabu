const mongoose = require('mongoose');
const { Address } = require('../models');
const { normalizePincode } = require('../utils/pincode');

class AddressController {
  /**
   * POST /api/v1/addresses
   * Create a new address for the authenticated customer
   */
  static async createAddress(req, res, next) {
    try {
      const {
        fullName,
        phone,
        addressLine,
        landmark,
        city,
        state,
        pincode,
        addressType,
        latitude,
        longitude,
        isDefault,
      } = req.body;

      if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Full name is required and must be a valid string',
        });
      }

      if (!phone || typeof phone !== 'string' || !/^\d{10}$/.test(phone.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit Indian phone number',
        });
      }

      if (!addressLine || typeof addressLine !== 'string' || !addressLine.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Address line is required and must be a valid string',
        });
      }

      const cleanPin = normalizePincode(pincode);
      if (!cleanPin) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 6-digit Indian PIN code',
        });
      }

      const normalizedType = addressType ? addressType.toUpperCase() : 'HOME';
      if (!['HOME', 'WORK', 'OTHER'].includes(normalizedType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address type. Expected HOME, WORK, or OTHER',
        });
      }

      // Check existing addresses count for this customer
      const existingCount = await Address.countDocuments({ user: req.user.id });
      let shouldBeDefault = Boolean(isDefault);

      // If this is the customer's very first address, automatically make it the default
      if (existingCount === 0) {
        shouldBeDefault = true;
      }

      // If setting as default, unset any previous default address for this user
      if (shouldBeDefault && existingCount > 0) {
        await Address.updateMany(
          { user: req.user.id, isDefault: true },
          { $set: { isDefault: false } }
        );
      }

      const address = await Address.create({
        user: req.user.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        addressLine: addressLine.trim(),
        landmark: typeof landmark === 'string' ? landmark.trim() : '',
        city: typeof city === 'string' && city.trim() ? city.trim() : 'Barrackpore',
        state: typeof state === 'string' && state.trim() ? state.trim() : 'West Bengal',
        pincode: cleanPin,
        addressType: normalizedType,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        isDefault: shouldBeDefault,
      });

      res.status(201).json({
        success: true,
        message: 'Address created successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/addresses
   * List all addresses belonging to the authenticated customer
   */
  static async getAddresses(req, res, next) {
    try {
      const addresses = await Address.find({ user: req.user.id }).sort({
        isDefault: -1,
        createdAt: -1,
      });

      res.status(200).json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/addresses/:id
   * Retrieve a single customer address by ID (scoped to authenticated user)
   */
  static async getAddressById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address identifier format',
        });
      }

      const address = await Address.findOne({
        _id: id,
        user: req.user.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      res.status(200).json({
        success: true,
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/addresses/:id
   * Update permitted address fields for the authenticated customer
   */
  static async updateAddress(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address identifier format',
        });
      }

      const address = await Address.findOne({
        _id: id,
        user: req.user.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      const {
        fullName,
        phone,
        addressLine,
        landmark,
        city,
        state,
        pincode,
        addressType,
        latitude,
        longitude,
        isDefault,
      } = req.body;

      if (fullName !== undefined) {
        if (typeof fullName !== 'string' || !fullName.trim()) {
          return res.status(400).json({ success: false, message: 'Full name must be a valid non-empty string' });
        }
        address.fullName = fullName.trim();
      }

      if (phone !== undefined) {
        if (typeof phone !== 'string' || !/^\d{10}$/.test(phone.trim())) {
          return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit Indian phone number' });
        }
        address.phone = phone.trim();
      }

      if (addressLine !== undefined) {
        if (typeof addressLine !== 'string' || !addressLine.trim()) {
          return res.status(400).json({ success: false, message: 'Address line must be a valid non-empty string' });
        }
        address.addressLine = addressLine.trim();
      }

      if (pincode !== undefined) {
        const cleanPin = normalizePincode(pincode);
        if (!cleanPin) {
          return res.status(400).json({ success: false, message: 'Please provide a valid 6-digit Indian PIN code' });
        }
        address.pincode = cleanPin;
      }

      if (addressType !== undefined) {
        const normalized = addressType.toUpperCase();
        if (!['HOME', 'WORK', 'OTHER'].includes(normalized)) {
          return res.status(400).json({ success: false, message: 'Invalid address type. Expected HOME, WORK, or OTHER' });
        }
        address.addressType = normalized;
      }

      if (landmark !== undefined) address.landmark = typeof landmark === 'string' ? landmark.trim() : '';
      if (city !== undefined) address.city = typeof city === 'string' && city.trim() ? city.trim() : address.city;
      if (state !== undefined) address.state = typeof state === 'string' && state.trim() ? state.trim() : address.state;
      if (latitude !== undefined) address.latitude = typeof latitude === 'number' ? latitude : null;
      if (longitude !== undefined) address.longitude = typeof longitude === 'number' ? longitude : null;

      // Handle default address toggle
      if (isDefault === true && !address.isDefault) {
        await Address.updateMany(
          { user: req.user.id, _id: { $ne: id }, isDefault: true },
          { $set: { isDefault: false } }
        );
        address.isDefault = true;
      }

      await address.save();

      res.status(200).json({
        success: true,
        message: 'Address updated successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/addresses/:id/default
   * Mark an address as the customer's default address
   */
  static async setDefaultAddress(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address identifier format',
        });
      }

      const address = await Address.findOne({
        _id: id,
        user: req.user.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      // Atomically unset all other default addresses for this customer
      await Address.updateMany(
        { user: req.user.id, isDefault: true },
        { $set: { isDefault: false } }
      );

      address.isDefault = true;
      await address.save();

      res.status(200).json({
        success: true,
        message: 'Default address updated successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/addresses/:id
   * Delete customer address and reassign default if needed
   */
  static async deleteAddress(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address identifier format',
        });
      }

      const address = await Address.findOne({
        _id: id,
        user: req.user.id,
      });

      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Address not found',
        });
      }

      const wasDefault = address.isDefault;
      await Address.deleteOne({ _id: id });

      // If the deleted address was the default, set the most recent remaining address as default
      if (wasDefault) {
        const remaining = await Address.findOne({ user: req.user.id }).sort({ createdAt: -1 });
        if (remaining) {
          remaining.isDefault = true;
          await remaining.save();
        }
      }

      res.status(200).json({
        success: true,
        message: 'Address deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AddressController;

