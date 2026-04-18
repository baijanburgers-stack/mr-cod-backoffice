import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:audioplayers/audioplayers.dart';
import '../models/order_model.dart';
import '../services/orders_service.dart';
import '../theme/app_theme.dart';

/// ------------------------------------------------------------
/// A utility that tells us which storeId the logged-in user
/// is assigned to. Falls back to asking in a dialog.
/// ------------------------------------------------------------
class _StoreResolver {
  static Future<String?> resolve(BuildContext context) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return null;

    final userDoc =
        await FirebaseFirestore.instance.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;

    final data = userDoc.data()!;

    // Super-admin has no fixed store → ask
    if (data['role'] == 'admin') {
      return _showStorePicker(context);
    }

    // Single store
    final storeId = data['storeId'] as String?;
    if (storeId != null && storeId.isNotEmpty) return storeId;

    // Multiple stores → pick
    final storeIds = data['storeIds'] as List<dynamic>?;
    if (storeIds != null && storeIds.length == 1) {
      return storeIds.first as String;
    }
    if (storeIds != null && storeIds.isNotEmpty) {
      return _showStorePicker(context,
          storeIds: storeIds.map((e) => e as String).toList());
    }

    return null;
  }

  static Future<String?> _showStorePicker(BuildContext context,
      {List<String>? storeIds}) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surfaceDark,
        title: const Text('Select Store',
            style: TextStyle(color: AppTheme.textPrimary)),
        content: storeIds != null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: storeIds
                    .map((id) => ListTile(
                          title: Text(id,
                              style:
                                  const TextStyle(color: AppTheme.textPrimary)),
                          onTap: () => Navigator.pop(ctx, id),
                        ))
                    .toList(),
              )
            : TextField(
                controller: controller,
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: const InputDecoration(
                    hintText: 'Store ID (e.g. laken)',
                    hintStyle: TextStyle(color: AppTheme.textMuted)),
              ),
        actions: storeIds == null
            ? [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, controller.text.trim()),
                  child: const Text('Confirm',
                      style: TextStyle(color: AppTheme.red)),
                )
              ]
            : null,
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────
// Main Orders Screen
// ──────────────────────────────────────────────────────────────

const _kTabs = ['Pending', 'Preparing', 'Ready', 'Out for Delivery'];

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _service = OrdersService();
  final _audio = AudioPlayer();

  String? _storeId;
  String _storeName = '';
  String _activeTab = 'Pending';
  List<OrderModel> _orders = [];
  List<Driver> _drivers = [];
  OrderModel? _selected;
  bool _initialLoad = true;
  StreamSubscription<List<OrderModel>>? _sub;

  // Driver assignment state
  Driver? _pendingDriver;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final storeId = await _StoreResolver.resolve(context);
    if (storeId == null || !mounted) return;

    _storeId = storeId;
    final name = await _service.fetchStoreName(storeId);
    final drivers = await _service.fetchDrivers(storeId);

    if (!mounted) return;
    setState(() {
      _storeName = name;
      _drivers = drivers;
    });

    _sub = _service.liveOrdersStream(storeId).listen((orders) {
      if (!mounted) return;

      // New order alert — only after initial load
      if (!_initialLoad) {
        final prevIds = _orders.map((o) => o.id).toSet();
        for (final order in orders) {
          if (!prevIds.contains(order.id) && order.isNew) {
            _playAlert();
            _showNewOrderBanner(order);
          }
        }
      }

      setState(() {
        _orders = orders;
        _initialLoad = false;
        // Keep selected in sync
        if (_selected != null) {
          _selected =
              orders.firstWhere((o) => o.id == _selected!.id, orElse: () {
            return _selected!;
          });
        }
      });
    });
  }

  Future<void> _playAlert() async {
    try {
      await _audio.play(AssetSource('sounds/bell.mp3'));
    } catch (_) {}
  }

  void _showNewOrderBanner(OrderModel order) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.pending,
        duration: const Duration(seconds: 6),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        content: Row(
          children: [
            const Icon(Icons.notifications_active, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('New Order #${order.orderNumber}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 15)),
                  Text(order.customerName,
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 13)),
                ],
              ),
            ),
            TextButton(
              onPressed: () {
                setState(() {
                  _activeTab = 'Pending';
                  _selected = order;
                });
                ScaffoldMessenger.of(context).hideCurrentSnackBar();
              },
              child: const Text('VIEW',
                  style: TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w900)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _sub?.cancel();
    _audio.dispose();
    super.dispose();
  }

  List<OrderModel> get _filtered => _orders.where((o) {
        if (_activeTab == 'Pending') {
          return o.status == 'Pending' || o.status == 'New';
        }
        return o.status == _activeTab;
      }).toList();

  Future<void> _updateStatus(String orderId, String newStatus) async {
    await _service.updateStatus(orderId, newStatus);
    if (_selected?.id == orderId) {
      setState(() {
        _selected = null;
        if (_kTabs.contains(newStatus)) _activeTab = newStatus;
      });
    }
  }

  Future<void> _assignDriver(
      String orderId, Driver driver, String readyTime) async {
    await _service.assignDriver(orderId, driver, readyTime);
    setState(() => _pendingDriver = null);
  }

  // ──────────────────────────────────────────────
  // Build
  // ──────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width >= 800;

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: _buildAppBar(),
      body: _storeId == null
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.red))
          : isWide
              ? Row(
                  children: [
                    SizedBox(width: 400, child: _buildOrderQueue()),
                    const VerticalDivider(
                        width: 1, color: AppTheme.divider),
                    Expanded(child: _buildDetailPanel()),
                  ],
                )
              : _selected == null
                  ? _buildOrderQueue()
                  : _buildDetailPanel(),
    );
  }

  AppBar _buildAppBar() {
    return AppBar(
      backgroundColor: AppTheme.surfaceDark,
      leading: _selected != null &&
              MediaQuery.of(context).size.width < 800
          ? IconButton(
              icon: const Icon(Icons.arrow_back, color: AppTheme.textPrimary),
              onPressed: () => setState(() => _selected = null),
            )
          : null,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(
            text: const TextSpan(
              children: [
                TextSpan(
                  text: 'MR',
                  style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w900),
                ),
                TextSpan(
                  text: 'COD',
                  style: TextStyle(
                      color: AppTheme.red,
                      fontSize: 20,
                      fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
          if (_storeName.isNotEmpty)
            Text(_storeName,
                style: const TextStyle(
                    color: AppTheme.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1)),
        ],
      ),
      actions: [
        // Order count badge
        Container(
          margin: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: _orders
                    .where((o) => o.isNew)
                    .isNotEmpty
                ? AppTheme.pending.withOpacity(0.15)
                : AppTheme.cardDark,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: _orders.where((o) => o.isNew).isNotEmpty
                  ? AppTheme.pending.withOpacity(0.4)
                  : AppTheme.divider,
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.receipt_long,
                  size: 16, color: AppTheme.textSecondary),
              const SizedBox(width: 6),
              Text('${_orders.length}',
                  style: TextStyle(
                    color: _orders.where((o) => o.isNew).isNotEmpty
                        ? AppTheme.pending
                        : AppTheme.textSecondary,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  )),
            ],
          ),
        ),
        PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert, color: AppTheme.textSecondary),
          color: AppTheme.surfaceDark,
          itemBuilder: (_) => [
            const PopupMenuItem(
              value: 'logout',
              child: Row(
                children: [
                  Icon(Icons.logout, color: AppTheme.rejected, size: 18),
                  SizedBox(width: 12),
                  Text('Sign Out', style: TextStyle(color: AppTheme.textPrimary)),
                ],
              ),
            ),
          ],
          onSelected: (val) async {
            if (val == 'logout') {
              await FirebaseAuth.instance.signOut();
            }
          },
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  // ── Left panel: queue ──────────────────────────────────────

  Widget _buildOrderQueue() {
    return Container(
      color: AppTheme.surfaceDark,
      child: Column(
        children: [
          // Status tab bar
          Container(
            padding: const EdgeInsets.all(12),
            color: AppTheme.surfaceDark,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _kTabs.map((tab) {
                  final count = _orders.where((o) {
                    if (tab == 'Pending') {
                      return o.status == 'Pending' || o.status == 'New';
                    }
                    return o.status == tab;
                  }).length;
                  final isActive = _activeTab == tab;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _activeTab = tab;
                      _selected = null;
                    }),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: isActive ? AppTheme.red : AppTheme.cardDark,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color:
                              isActive ? AppTheme.red : AppTheme.divider,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            tab,
                            style: TextStyle(
                              color: isActive
                                  ? Colors.white
                                  : AppTheme.textSecondary,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          if (count > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: isActive
                                    ? Colors.white.withOpacity(0.3)
                                    : (tab == 'Pending'
                                        ? AppTheme.pending
                                        : AppTheme.divider),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                '$count',
                                style: TextStyle(
                                  color: isActive
                                      ? Colors.white
                                      : AppTheme.textPrimary,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Order list
          Expanded(
            child: _filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle_outline,
                            size: 64,
                            color: AppTheme.textMuted.withOpacity(0.4)),
                        const SizedBox(height: 16),
                        Text(
                          'Queue Clear',
                          style: TextStyle(
                            color: AppTheme.textMuted,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'No ${_activeTab.toLowerCase()} orders',
                          style: const TextStyle(
                              color: AppTheme.textMuted, fontSize: 14),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) => _buildOrderCard(_filtered[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderCard(OrderModel order) {
    final isSelected = _selected?.id == order.id;
    final statusColor = AppTheme.statusColor(order.status);

    return GestureDetector(
      onTap: () => setState(() => _selected = order),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.red.withOpacity(0.12)
              : AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppTheme.red : AppTheme.divider,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Order number
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundDark,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '#${order.orderNumber}',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                // Type badge
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: order.isDelivery
                        ? const Color(0xFF1A237E).withOpacity(0.3)
                        : const Color(0xFF1B5E20).withOpacity(0.3),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: order.isDelivery
                          ? const Color(0xFF3949AB).withOpacity(0.5)
                          : const Color(0xFF388E3C).withOpacity(0.5),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        order.isDelivery
                            ? Icons.directions_bike
                            : Icons.shopping_bag_outlined,
                        size: 12,
                        color: order.isDelivery
                            ? const Color(0xFF90CAF9)
                            : const Color(0xFF81C784),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        order.type.toUpperCase(),
                        style: TextStyle(
                          color: order.isDelivery
                              ? const Color(0xFF90CAF9)
                              : const Color(0xFF81C784),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                // New indicator
                if (order.isNew)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppTheme.pending,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.person_outline,
                    size: 14, color: AppTheme.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    order.customerName,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.access_time,
                        size: 13, color: AppTheme.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      order.timeString,
                      style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      '${order.items.length} item${order.items.length != 1 ? 's' : ''}',
                      style: const TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 13,
                          fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
                Text(
                  '€${order.total.toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Right panel: detail ────────────────────────────────────

  Widget _buildDetailPanel() {
    if (_selected == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.touch_app_outlined,
                size: 64, color: AppTheme.textMuted),
            SizedBox(height: 16),
            Text('Select an order to review',
                style:
                    TextStyle(color: AppTheme.textMuted, fontSize: 16)),
          ],
        ),
      );
    }

    final order = _selected!;
    return Column(
      children: [
        // Header
        _buildDetailHeader(order),
        // Body
        Expanded(child: _buildDetailBody(order)),
        // Action footer
        _buildActionFooter(order),
      ],
    );
  }

  Widget _buildDetailHeader(OrderModel order) {
    return Container(
      padding: const EdgeInsets.all(20),
      color: AppTheme.surfaceDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text('#${order.orderNumber}',
                style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w900,
                    fontSize: 32,
                    letterSpacing: -1)),
            const SizedBox(width: 12),
            _typeBadge(order),
            const Spacer(),
            Text('€${order.total.toStringAsFixed(2)}',
                style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w900,
                    fontSize: 28,
                    letterSpacing: -1)),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 10, runSpacing: 8, children: [
            _infoChip(Icons.person_outline, order.customerName),
            _infoChip(Icons.phone_outlined, order.phone),
            if (order.isDelivery && order.address != null)
              _infoChip(Icons.location_on_outlined, order.address!),
            _infoChip(Icons.access_time, order.timeString),
          ]),
          if (order.deliveryPin != null) ...[
            const SizedBox(height: 12),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.amber.withOpacity(0.5)),
              ),
              child: Row(children: [
                const Icon(Icons.key, color: AppTheme.amber, size: 18),
                const SizedBox(width: 10),
                const Text('Delivery PIN:',
                    style: TextStyle(
                        color: Color(0xFF5D4037),
                        fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Text(order.deliveryPin!,
                    style: const TextStyle(
                        color: Color(0xFF5D4037),
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                        letterSpacing: 4,
                        fontFamily: 'monospace')),
              ]),
            ),
          ],
          // Driver assignment
          if (order.isDelivery &&
              ['New', 'Pending', 'Preparing', 'Ready', 'Out for Delivery']
                  .contains(order.status))
            _buildDriverAssignment(order),
        ],
      ),
    );
  }

  Widget _typeBadge(OrderModel order) {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: order.isDelivery
            ? const Color(0xFF1A237E).withOpacity(0.3)
            : const Color(0xFF1B5E20).withOpacity(0.3),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: order.isDelivery
              ? const Color(0xFF3949AB).withOpacity(0.5)
              : const Color(0xFF388E3C).withOpacity(0.5),
        ),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(
          order.isDelivery
              ? Icons.directions_bike
              : Icons.shopping_bag_outlined,
          size: 14,
          color: order.isDelivery
              ? const Color(0xFF90CAF9)
              : const Color(0xFF81C784),
        ),
        const SizedBox(width: 6),
        Text(order.type.toUpperCase(),
            style: TextStyle(
                color: order.isDelivery
                    ? const Color(0xFF90CAF9)
                    : const Color(0xFF81C784),
                fontWeight: FontWeight.w700,
                fontSize: 12)),
      ]),
    );
  }

  Widget _infoChip(IconData icon, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 14, color: AppTheme.textMuted),
      const SizedBox(width: 5),
      Text(label,
          style: const TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500)),
    ]);
  }

  Widget _buildDriverAssignment(OrderModel order) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Divider(color: AppTheme.divider, height: 24),
      Row(children: [
        const Text('Driver Assignment',
            style: TextStyle(
                color: AppTheme.textMuted,
                fontWeight: FontWeight.w700,
                fontSize: 11,
                letterSpacing: 1.5)),
        const Spacer(),
        if (order.driver != null)
          TextButton(
            onPressed: () => _service.clearDriver(order.id),
            child: const Text('REASSIGN',
                style: TextStyle(
                    color: AppTheme.red,
                    fontSize: 11,
                    fontWeight: FontWeight.w800)),
          ),
      ]),
      const SizedBox(height: 8),
      if (order.driver != null)
        _assignedDriverTile(order)
      else if (_pendingDriver != null && _pendingDriver != null)
        _readyTimePicker(order)
      else
        _driverList(order),
    ]);
  }

  Widget _assignedDriverTile(OrderModel order) {
    final driver = order.driver!;
    final statusText = switch (order.driverAssignmentStatus) {
      'pending' => '⏳ Awaiting response...',
      'accepted' => '✅ Accepted',
      'rejected' => '❌ Rejected',
      _ => '${driver.vehicle} • ${driver.eta}',
    };
    final isRejected = order.driverAssignmentStatus == 'rejected';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isRejected
            ? const Color(0xFFB71C1C).withOpacity(0.1)
            : const Color(0xFF1A237E).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isRejected
              ? const Color(0xFFB71C1C).withOpacity(0.3)
              : const Color(0xFF3949AB).withOpacity(0.3),
        ),
      ),
      child: Row(children: [
        Icon(
          driver.vehicle == 'Car'
              ? Icons.directions_car
              : Icons.directions_bike,
          color: isRejected
              ? const Color(0xFFEF9A9A)
              : const Color(0xFF90CAF9),
          size: 28,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(driver.name,
                style: TextStyle(
                    color: isRejected
                        ? const Color(0xFFEF9A9A)
                        : const Color(0xFF90CAF9),
                    fontWeight: FontWeight.w800,
                    fontSize: 15)),
            Text(statusText,
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 12)),
          ]),
        ),
      ]),
    );
  }

  Widget _readyTimePicker(OrderModel order) {
    final driver = _pendingDriver!;
    final times = ['Now', '5 mins', '10 mins', '15 mins', '20 mins', '30 mins'];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('Ready time for ${driver.name}',
            style: const TextStyle(
                color: AppTheme.amber,
                fontWeight: FontWeight.w800,
                fontSize: 13)),
        const Spacer(),
        IconButton(
          icon: const Icon(Icons.close, color: AppTheme.textMuted, size: 18),
          onPressed: () => setState(() => _pendingDriver = null),
        ),
      ]),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: times
            .map((t) => GestureDetector(
                  onTap: () => _assignDriver(order.id, driver, t),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppTheme.cardDark,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.divider),
                    ),
                    child: Text(t,
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 13)),
                  ),
                ))
            .toList(),
      ),
    ]);
  }

  Widget _driverList(OrderModel order) {
    if (_drivers.isEmpty) {
      return const Text('No drivers available',
          style: TextStyle(color: AppTheme.textMuted, fontSize: 13));
    }
    return SizedBox(
      height: 90,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _drivers.length,
        itemBuilder: (_, i) {
          final driver = _drivers[i];
          final active = _orders
              .where((o) =>
                  o.driver?.id == driver.id && o.status != 'Completed')
              .length;
          return GestureDetector(
            onTap: () => setState(() => _pendingDriver = driver),
            child: Container(
              width: 100,
              margin: const EdgeInsets.only(right: 10),
              decoration: BoxDecoration(
                color: AppTheme.cardDark,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.divider),
              ),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Icon(
                          driver.vehicle == 'Car'
                              ? Icons.directions_car
                              : Icons.directions_bike,
                          color: AppTheme.textSecondary,
                          size: 28,
                        ),
                        if (active > 0)
                          Positioned(
                            top: -4,
                            right: -8,
                            child: Container(
                              width: 16,
                              height: 16,
                              decoration: const BoxDecoration(
                                color: AppTheme.rejected,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text('$active',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w900)),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(driver.name,
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center),
                  ]),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDetailBody(OrderModel order) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Customer notes
        if (order.notes.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFB71C1C).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: const Color(0xFFB71C1C).withOpacity(0.3)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.warning_amber_outlined,
                  color: AppTheme.rejected, size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('CUSTOMER NOTE',
                          style: TextStyle(
                              color: AppTheme.rejected,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.5)),
                      const SizedBox(height: 4),
                      Text(order.notes,
                          style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontWeight: FontWeight.w600,
                              fontStyle: FontStyle.italic)),
                    ]),
              ),
            ]),
          ),

        // Items table header
        const Row(children: [
          SizedBox(
            width: 40,
            child: Text('QTY',
                style: TextStyle(
                    color: AppTheme.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1)),
          ),
          Expanded(
            child: Text('ITEM',
                style: TextStyle(
                    color: AppTheme.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1)),
          ),
          Text('TOTAL',
              style: TextStyle(
                  color: AppTheme.textMuted,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1)),
        ]),
        const Divider(color: AppTheme.divider, height: 16),

        // Items
        ...order.items.map((item) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 40,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.cardDark,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('${item.qty}x',
                          style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontWeight: FontWeight.w900,
                              fontSize: 14)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.name,
                              style: const TextStyle(
                                  color: AppTheme.textPrimary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15)),
                          if (item.modifiers.isNotEmpty)
                            ...item.modifiers.map((m) => Text(
                                '+ ${m.name}',
                                style: const TextStyle(
                                    color: AppTheme.textMuted,
                                    fontSize: 12))),
                        ]),
                  ),
                  Text(
                    '€${(item.price * item.qty).toStringAsFixed(2)}',
                    style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontWeight: FontWeight.w800,
                        fontSize: 15),
                  ),
                ],
              ),
            )),

        const Divider(color: AppTheme.divider, height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('TOTAL',
                style: TextStyle(
                    color: AppTheme.textMuted,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    letterSpacing: 2)),
            Text('€${order.total.toStringAsFixed(2)}',
                style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w900,
                    fontSize: 28,
                    letterSpacing: -1)),
          ],
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildActionFooter(OrderModel order) {
    final (label, icon, color, nextStatus, secondaryLabel, secondaryNext) =
        _actionConfig(order);

    return Container(
      padding: const EdgeInsets.all(16),
      color: AppTheme.surfaceDark,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Secondary (reject)
          if (secondaryLabel != null) ...[
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1C1C1C),
                  foregroundColor: AppTheme.rejected,
                  side: const BorderSide(color: AppTheme.rejected),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () => _updateStatus(order.id, secondaryNext!),
                child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.close, size: 18),
                      const SizedBox(width: 8),
                      Text(secondaryLabel,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                    ]),
              ),
            ),
            const SizedBox(height: 10),
          ],
          // Primary
          SizedBox(
            width: double.infinity,
            height: 60,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: color,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
              onPressed: label == null
                  ? null
                  : () => _updateStatus(order.id, nextStatus!),
              child: label == null
                  ? const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle, size: 22),
                        SizedBox(width: 10),
                        Text('Order Completed',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w900)),
                      ],
                    )
                  : Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(icon, size: 22),
                      const SizedBox(width: 10),
                      Text(label,
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w900)),
                    ]),
            ),
          ),
        ],
      ),
    );
  }

  (String?, IconData, Color, String?, String?, String?) _actionConfig(
      OrderModel order) {
    return switch (order.status) {
      'Pending' || 'New' => (
          'Accept Order',
          Icons.check_circle_outline,
          AppTheme.ready,
          'Preparing',
          'Reject',
          'Rejected',
        ),
      'Preparing' => (
          'Mark as Ready',
          Icons.check_circle_outline,
          const Color(0xFF1565C0),
          'Ready',
          null,
          null,
        ),
      'Ready' when !order.isDelivery => (
          'Complete Order',
          Icons.check,
          const Color(0xFF212121),
          'Completed',
          null,
          null,
        ),
      'Ready' when order.isDelivery && order.driver == null => (
          'Assign Driver First',
          Icons.directions_bike,
          const Color(0xFF424242),
          null,
          null,
          null,
        ),
      'Ready' when order.isDelivery => (
          'Dispatch to Driver',
          Icons.directions_bike,
          AppTheme.amber,
          'Out for Delivery',
          null,
          null,
        ),
      'Out for Delivery' => (
          'Mark Delivered',
          Icons.check,
          const Color(0xFF212121),
          'Completed',
          null,
          null,
        ),
      _ => (null, Icons.check_circle, AppTheme.completed, null, null, null),
    };
  }
}
