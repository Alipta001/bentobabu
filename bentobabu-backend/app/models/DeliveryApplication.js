const mongoose = require('mongoose');

const documentItemSchema = new mongoose.Schema(
  {
    secureUrl: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const deliveryApplicationSchema = new mongoose.Schema(
  {
    applicationNumber: {
      type: String,
      required: [true, 'Application number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    personalInfo: {
      fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
        maxlength: 100,
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        match: [/^\d{10}$/, 'Please enter a valid 10-digit Indian mobile number'],
        index: true,
      },
      email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
        index: true,
      },
      dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required'],
      },
      gender: {
        type: String,
        enum: {
          values: ['MALE', 'FEMALE', 'OTHER'],
          message: '{VALUE} is not a valid gender option',
        },
        required: [true, 'Gender is required'],
      },
    },
    address: {
      houseNo: {
        type: String,
        required: [true, 'House/Flat number is required'],
        trim: true,
      },
      street: {
        type: String,
        required: [true, 'Street/Area is required'],
        trim: true,
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true,
      },
      state: {
        type: String,
        required: [true, 'State is required'],
        trim: true,
      },
      pincode: {
        type: String,
        required: [true, 'PIN code is required'],
        trim: true,
        match: [/^\d{6}$/, 'Please enter a valid 6-digit PIN code'],
      },
      landmark: {
        type: String,
        trim: true,
        default: '',
      },
    },
    vehicleInfo: {
      vehicleType: {
        type: String,
        enum: {
          values: ['BICYCLE', 'MOTORCYCLE', 'SCOOTER', 'ELECTRIC_VEHICLE'],
          message: '{VALUE} is not a valid vehicle type',
        },
        required: [true, 'Vehicle type is required'],
      },
      brand: {
        type: String,
        trim: true,
        default: '',
      },
      model: {
        type: String,
        trim: true,
        default: '',
      },
      registrationNumber: {
        type: String,
        trim: true,
        uppercase: true,
        default: '',
      },
      drivingLicenseNumber: {
        type: String,
        trim: true,
        uppercase: true,
        default: '',
      },
    },
    documents: {
      profilePhoto: {
        type: documentItemSchema,
        required: [true, 'Profile photo is required'],
      },
      idProof: {
        idType: {
          type: String,
          enum: ['AADHAAR', 'PAN', 'VOTER_ID'],
          default: 'AADHAAR',
        },
        document: {
          type: documentItemSchema,
          required: [true, 'Government ID proof is required'],
        },
      },
      drivingLicense: {
        type: documentItemSchema,
        default: null,
      },
      registrationCertificate: {
        type: documentItemSchema,
        default: null,
      },
      insurance: {
        type: documentItemSchema,
        default: null,
      },
    },
    status: {
      type: String,
      enum: {
        values: [
          'PENDING_VERIFICATION',
          'PENDING_APPROVAL',
          'APPROVED',
          'REJECTED',
          'CORRECTIONS_REQUESTED',
          'SUSPENDED',
        ],
        message: '{VALUE} is not a valid delivery application status',
      },
      default: 'PENDING_APPROVAL',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    requestedCorrections: {
      type: String,
      trim: true,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    termsAccepted: {
      type: Boolean,
      default: true,
      required: true,
    },
    termsAcceptedAt: {
      type: Date,
      default: Date.now,
    },
    history: [
      {
        status: {
          type: String,
          required: true,
        },
        action: {
          type: String,
          required: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        note: {
          type: String,
          default: '',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pre-validate vehicle documents when not bicycle
deliveryApplicationSchema.pre('validate', function () {
  if (this.vehicleInfo && this.vehicleInfo.vehicleType !== 'BICYCLE') {
    if (!this.documents?.drivingLicense?.secureUrl) {
      this.invalidate('documents.drivingLicense', 'Driving license is required for motorized vehicles');
    }
  }
});

const DeliveryApplication = mongoose.model('DeliveryApplication', deliveryApplicationSchema);

module.exports = DeliveryApplication;
