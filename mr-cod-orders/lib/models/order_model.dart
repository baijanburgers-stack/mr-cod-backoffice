import 'package:cloud_firestore/cloud_firestore.dart';

/// Represents a modifier option (e.g. "Extra Sauce") on an order item.
class OrderItemModifier {
  final String name;
  final double price;

  const OrderItemModifier({required this.name, required this.price});

  factory OrderItemModifier.fromMap(Map<String, dynamic> map) {
    return OrderItemModifier(
      name: map['name'] as String? ?? '',
      price: (map['price'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

/// One line item inside an order.
class OrderItem {
  final String name;
  final int qty;
  final double price;
  final List<OrderItemModifier> modifiers;

  const OrderItem({
    required this.name,
    required this.qty,
    required this.price,
    this.modifiers = const [],
  });

  factory OrderItem.fromMap(Map<String, dynamic> map) {
    return OrderItem(
      name: map['name'] as String? ?? 'Unknown Item',
      qty: (map['quantity'] as num?)?.toInt() ?? 1,
      price: (map['price'] as num?)?.toDouble() ?? 0.0,
      modifiers: (map['modifiers'] as List<dynamic>? ?? [])
          .map((m) => OrderItemModifier.fromMap(m as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// A driver assigned to a delivery order.
class Driver {
  final String id;
  final String name;
  final String phone;
  final String vehicle;
  final String eta;

  const Driver({
    required this.id,
    required this.name,
    required this.phone,
    required this.vehicle,
    required this.eta,
  });

  factory Driver.fromMap(Map<String, dynamic> map) {
    return Driver(
      id: map['id'] as String? ?? '',
      name: map['name'] as String? ?? 'Unknown Driver',
      phone: map['phone'] as String? ?? '',
      vehicle: map['vehicle'] as String? ?? 'Bike',
      eta: map['eta'] as String? ?? '15 mins',
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'phone': phone,
        'vehicle': vehicle,
        'eta': eta,
      };
}

/// GPS coordinates for a live delivery.
class LiveLocation {
  final double lat;
  final double lng;

  const LiveLocation({required this.lat, required this.lng});

  factory LiveLocation.fromMap(Map<String, dynamic> map) {
    return LiveLocation(
      lat: (map['lat'] as num?)?.toDouble() ?? 0.0,
      lng: (map['lng'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

/// Full order model — mirrors the Firestore schema used by the web backoffice.
class OrderModel {
  final String id;
  final String orderNumber;
  final String customerName;
  final String phone;
  final String type; // 'Delivery' | 'Pickup'
  final String? address;
  final String status;
  final DateTime? createdAt;
  final double total;
  final double subtotal;
  final double discount;
  final List<OrderItem> items;
  final String notes;
  final Driver? driver;
  final LiveLocation? liveLocation;
  final String? driverAssignmentStatus; // pending | accepted | rejected
  final String? assignedDriverId;
  final String? orderReadyTime;
  final String? deliveryPin;

  const OrderModel({
    required this.id,
    required this.orderNumber,
    required this.customerName,
    required this.phone,
    required this.type,
    this.address,
    required this.status,
    this.createdAt,
    required this.total,
    required this.subtotal,
    required this.discount,
    required this.items,
    required this.notes,
    this.driver,
    this.liveLocation,
    this.driverAssignmentStatus,
    this.assignedDriverId,
    this.orderReadyTime,
    this.deliveryPin,
  });

  factory OrderModel.fromSnapshot(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};

    DateTime? createdAt;
    final rawCreated = data['createdAt'];
    if (rawCreated is Timestamp) {
      createdAt = rawCreated.toDate();
    } else if (rawCreated is String) {
      createdAt = DateTime.tryParse(rawCreated);
    }

    Driver? driver;
    if (data['driver'] != null) {
      driver = Driver.fromMap(data['driver'] as Map<String, dynamic>);
    }

    LiveLocation? liveLocation;
    if (data['liveLocation'] != null) {
      liveLocation =
          LiveLocation.fromMap(data['liveLocation'] as Map<String, dynamic>);
    }

    return OrderModel(
      id: doc.id,
      orderNumber: data['orderNumber'] as String? ??
          doc.id.substring(0, 6).toUpperCase(),
      customerName: data['customerName'] as String? ?? 'Unknown Customer',
      phone: data['phone'] as String? ?? '',
      type: data['type'] as String? ?? 'Pickup',
      address: data['address'] as String?,
      status: data['status'] as String? ?? 'New',
      createdAt: createdAt,
      total: (data['total'] as num?)?.toDouble() ?? 0.0,
      subtotal: (data['subtotal'] as num?)?.toDouble() ?? 0.0,
      discount: (data['discount'] as num?)?.toDouble() ?? 0.0,
      items: (data['items'] as List<dynamic>? ?? [])
          .map((i) => OrderItem.fromMap(i as Map<String, dynamic>))
          .toList(),
      notes: data['notes'] as String? ?? '',
      driver: driver,
      liveLocation: liveLocation,
      driverAssignmentStatus: data['driverAssignmentStatus'] as String?,
      assignedDriverId: data['assignedDriverId'] as String?,
      orderReadyTime: data['orderReadyTime'] as String?,
      deliveryPin: data['deliveryPin'] as String?,
    );
  }

  /// Formatted time string like "14:32".
  String get timeString {
    if (createdAt == null) return 'Just now';
    final h = createdAt!.hour.toString().padLeft(2, '0');
    final m = createdAt!.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  bool get isNew => status == 'New' || status == 'Pending';
  bool get isDelivery => type == 'Delivery';
}
