import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/order_model.dart';

class OrdersService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Returns a live stream of active (non-completed) orders for a store,
  /// ordered by creation time descending — same query as the backoffice.
  Stream<List<OrderModel>> liveOrdersStream(String storeId) {
    return _db
        .collection('orders')
        .where('storeId', isEqualTo: storeId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map(OrderModel.fromSnapshot)
          .where((o) =>
              !['Completed', 'Cancelled', 'Rejected'].contains(o.status))
          .toList();
    });
  }

  /// Fetches all drivers assigned to this store.
  Future<List<Driver>> fetchDrivers(String storeId) async {
    final results = <String, Driver>{};

    Future<void> fetchFromQuery(Query<Map<String, dynamic>> q) async {
      final snap = await q.get();
      for (final doc in snap.docs) {
        final data = doc.data();
        results[doc.id] = Driver(
          id: doc.id,
          name: data['name'] as String? ?? 'Unnamed Driver',
          phone: data['phone'] as String? ?? '',
          vehicle: data['vehicle'] as String? ?? 'Bike',
          eta: '15 mins',
        );
      }
    }

    final users = _db.collection('users');
    await Future.wait([
      fetchFromQuery(
          users.where('storeId', isEqualTo: storeId).where('role', isEqualTo: 'delivery')),
      fetchFromQuery(
          users.where('storeIds', arrayContains: storeId).where('role', isEqualTo: 'delivery')),
    ]);

    return results.values.toList();
  }

  /// Fetches the store name.
  Future<String> fetchStoreName(String storeId) async {
    final doc = await _db.collection('stores').doc(storeId).get();
    return doc.data()?['name'] as String? ?? storeId;
  }

  /// Updates the status of an order.
  Future<void> updateStatus(String orderId, String newStatus) async {
    final updates = <String, dynamic>{'status': newStatus};

    // Auto-generate delivery PIN when accepting a delivery order
    if (newStatus == 'Preparing') {
      final orderDoc = await _db.collection('orders').doc(orderId).get();
      final type = orderDoc.data()?['type'] as String?;
      if (type == 'Delivery') {
        final pin =
            (1000 + DateTime.now().millisecondsSinceEpoch % 9000).toString();
        updates['deliveryPin'] = pin;
      }
    }

    await _db.collection('orders').doc(orderId).update(updates);
  }

  /// Assigns a driver with a ready time.
  Future<void> assignDriver(
      String orderId, Driver driver, String readyTime) async {
    await _db.collection('orders').doc(orderId).update({
      'driver': driver.toMap(),
      'assignedDriverId': driver.id,
      'driverAssignmentStatus': 'pending',
      'orderReadyTime': readyTime,
    });
  }

  /// Clears the driver assignment on an order.
  Future<void> clearDriver(String orderId) async {
    await _db.collection('orders').doc(orderId).update({
      'driver': FieldValue.delete(),
      'assignedDriverId': FieldValue.delete(),
      'driverAssignmentStatus': FieldValue.delete(),
      'orderReadyTime': FieldValue.delete(),
    });
  }
}
