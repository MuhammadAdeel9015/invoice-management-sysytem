import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:my_project/models/invoice_model.dart';

import '../config/api_config.dart';

class ApiService {
  static String get baseUrl => '${ApiConfig.baseUrl}/api';

  static String get serverUrl => ApiConfig.baseUrl;
  static String get loginUrl => '${ApiConfig.baseUrl}/login';

  static Future<String?> login(String username, String pass) async {
    try {
      final uri = Uri.parse(loginUrl);
      final res = await http.post(
        uri,
        body: jsonEncode({'username': username, 'password': pass}),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token']);
      await prefs.setString('role', data['user']['role'] ?? 'user');
      return data['user']['role'] ?? 'user';
    } catch (e) {
      debugPrint('Login error: $e');
      return null;
    }
  }

  static Future<Map<String, dynamic>> getInvoices({
    String search = '',
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) throw Exception('AUTH_REQUIRED');

    final queryParams = {
      if (search.isNotEmpty) 'search': search,
      if (startDate != null)
        'startDate': startDate.toIso8601String().split('T')[0],
      if (endDate != null) 'endDate': endDate.toIso8601String().split('T')[0],
    };
    final uri =
        Uri.parse('$baseUrl/invoices').replace(queryParameters: queryParams);
    final res = await http.get(uri, headers: {
      'Authorization': 'Bearer $token'
    }).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) throw Exception('Failed to load invoices');

    final data = jsonDecode(res.body);
    return {
      'invoices':
          (data['invoices'] as List).map((e) => Invoice.fromJson(e)).toList(),
      'totalAmount': double.parse(data['totalAmount'].toString()),
    };
  }

  static Future<void> uploadInvoice({
    required String title,
    required String vendor,
    required String amount,
    required String category,
    required String description,
    required String date,
    required Uint8List imageBytes,
    String? filename,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) throw Exception('AUTH_REQUIRED');

    var request = http.MultipartRequest('POST', Uri.parse('$baseUrl/invoices'));
    request.headers['Authorization'] = 'Bearer $token';
    request.fields['title'] = title;
    request.fields['vendor'] = vendor;
    request.fields['amount'] = amount;
    request.fields['category'] = category;
    request.fields['description'] = description;
    request.fields['date'] = date;

    final part = http.MultipartFile.fromBytes('image', imageBytes,
        filename: filename ?? 'invoice.jpg');
    request.files.add(part);

    final streamed = await request.send().timeout(const Duration(seconds: 30));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode != 200) throw Exception('Invoice upload failed');
  }

  static Future<void> deleteInvoice(int id) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) throw Exception('AUTH_REQUIRED');

    final res = await http.delete(Uri.parse('$baseUrl/invoices/$id'), headers: {
      'Authorization': 'Bearer $token'
    }).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) throw Exception('Delete failed');
  }

  static Future<String> getPDFUrl(
      DateTime? startDate, DateTime? endDate) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final queryParams = {
      if (startDate != null)
        'startDate': startDate.toIso8601String().split('T')[0],
      if (endDate != null) 'endDate': endDate.toIso8601String().split('T')[0],
    };
    final uri = Uri.parse('$baseUrl/invoices/export-pdf')
        .replace(queryParameters: queryParams);
    final res = await http.get(uri, headers: {
      'Authorization': 'Bearer $token'
    }).timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) throw Exception('Export endpoint failed');
    return uri.toString();
  }
}
