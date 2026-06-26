import 'dart:convert';

sealed class AiStreamEvent {
  const AiStreamEvent();
}

class AiStreamStart extends AiStreamEvent {
  const AiStreamStart(this.runId);
  final String runId;
}

class AiStreamDelta extends AiStreamEvent {
  const AiStreamDelta(this.text);
  final String text;
}

class AiStreamDone extends AiStreamEvent {
  const AiStreamDone(this.messageId, this.content, this.createdAt);
  final String messageId;
  final String content;
  final String createdAt;
}

class AiStreamProposalDone extends AiStreamEvent {
  const AiStreamProposalDone(this.content);
  final String content;
}

class AiStreamError extends AiStreamEvent {
  const AiStreamError(this.category);
  final String category;
}

class AiSseParser {
  final _decoder = const Utf8Decoder();
  final _buffer = StringBuffer();
  var _terminalSeen = false;

  List<AiStreamEvent> add(List<int> chunk) {
    _buffer.write(_decoder.convert(chunk));
    return _drain(allowPartial: true);
  }

  List<AiStreamEvent> close() {
    final events = _drain(allowPartial: false);
    if (!_terminalSeen) {
      throw const FormatException('AI stream ended without a terminal event.');
    }
    return events;
  }

  List<AiStreamEvent> _drain({required bool allowPartial}) {
    final raw = _buffer.toString();
    final parts = raw.split(RegExp(r'\r?\n\r?\n'));
    _buffer.clear();
    if (allowPartial && !raw.endsWith('\n\n') && !raw.endsWith('\r\n\r\n')) {
      _buffer.write(parts.removeLast());
    }
    final events = <AiStreamEvent>[];
    for (final part in parts.where((part) => part.trim().isNotEmpty)) {
      final dataLines = part
          .split(RegExp(r'\r?\n'))
          .where((line) => line.startsWith('data:'))
          .map((line) => line.substring(5).trimLeft());
      final data = dataLines.join('\n');
      if (data.isEmpty) continue;
      final json = jsonDecode(data);
      if (json is! Map<String, dynamic>) {
        throw const FormatException('Malformed AI stream event.');
      }
      final event = _parseEvent(json);
      if (event is AiStreamDone ||
          event is AiStreamError ||
          event is AiStreamProposalDone) {
        if (_terminalSeen) {
          throw const FormatException('Duplicate terminal AI stream event.');
        }
        _terminalSeen = true;
      }
      events.add(event);
    }
    return events;
  }

  AiStreamEvent _parseEvent(Map<String, dynamic> json) {
    return switch (json['type']) {
      'start' => AiStreamStart(_string(json['run_id'])),
      'delta' => AiStreamDelta(_string(json['text'])),
      'error' => AiStreamError(_string(json['category'])),
      'proposal_done' => AiStreamProposalDone(_string(json['content'])),
      'done' => () {
        final message = json['message'];
        if (message is! Map<String, dynamic>) {
          throw const FormatException('Malformed AI done event.');
        }
        return AiStreamDone(
          _string(message['id']),
          _string(message['content']),
          _string(message['created_at']),
        );
      }(),
      _ => throw const FormatException('Unknown AI stream event.'),
    };
  }

  String _string(Object? value) {
    if (value is String) return value;
    throw const FormatException('Malformed AI stream event.');
  }
}
