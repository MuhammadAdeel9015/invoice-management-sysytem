import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String pcIp = '192.168.1.6';
  static const int port = 3000;

  static String get baseUrl {
    final host = kIsWeb ? Uri.base.host : pcIp;
    return 'http://$host:$port';
  }
}
