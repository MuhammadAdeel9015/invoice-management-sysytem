class Invoice {
  final int? id;
  final String title;
  final String vendor;
  final double amount;
  final String category;
  final String description;
  final String imageUrl;
  final DateTime date;
  final String? userName;

  Invoice({
    this.id,
    required this.title,
    required this.vendor,
    required this.amount,
    required this.category,
    required this.description,
    required this.imageUrl,
    required this.date,
    this.userName,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) {
    return Invoice(
      id: json['id'],
      title: json['title'] ?? '',
      vendor: json['vendor'] ?? '',
      amount: double.parse(json['amount'].toString()),
      category: json['category'] ?? '',
      description: json['description'] ?? '',
      imageUrl: json['image_url'] ?? '',
      date: DateTime.parse(json['invoice_date']),
      userName: json['user_name'] ?? '',
    );
  }
}
