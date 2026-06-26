import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:url_launcher/url_launcher.dart';

class SafeMarkdown extends StatelessWidget {
  const SafeMarkdown(this.data, {super.key});
  final String data;

  @override
  Widget build(BuildContext context) {
    return MarkdownBody(
      data: data,
      selectable: true,
      extensionSet: md.ExtensionSet.gitHubFlavored,
      sizedImageBuilder: (_) => const Text('[remote image omitted]'),
      onTapLink: (_, href, __) async {
        final uri = Uri.tryParse(href ?? '');
        if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https')) {
          return;
        }
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      },
      builders: {'code': CodeElementBuilder()},
    );
  }
}

class CodeElementBuilder extends MarkdownElementBuilder {
  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final text = element.textContent;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(
            tooltip: 'Copy code',
            onPressed: () => Clipboard.setData(ClipboardData(text: text)),
            icon: const Icon(Icons.copy, color: Colors.white70),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Text(
              text,
              style: const TextStyle(
                color: Colors.white,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
