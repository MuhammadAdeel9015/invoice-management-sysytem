import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';

class AuthService {
  static Future<Map> login(String username, String password) async {
    try {
      final response = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'username': username, 'password': password}),
          )
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map;
      if (response.statusCode == 200) return body;
      throw Exception(body['error'] ?? body['message'] ?? 'Login failed');
    } on FormatException {
      throw Exception('The server returned an invalid response.');
    } on Exception catch (error) {
      if (error.toString().startsWith('Exception:')) rethrow;
      throw Exception(
        'Connection failed. Check that the backend is running at ${ApiConfig.baseUrl}.',
      );
    }
  }
}
