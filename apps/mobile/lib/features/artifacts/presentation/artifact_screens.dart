import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/widgets/common.dart';
import '../../shared/data/council_repositories.dart';
import '../../shared/domain/council_models.dart';

final artifactsProvider = FutureProvider<List<Artifact>>(
  (ref) => ref.watch(artifactsRepositoryProvider).list(),
);
final artifactProvider = FutureProvider.family<Artifact, String>(
  (ref, id) => ref.watch(artifactsRepositoryProvider).get(id),
);

class ArtifactsScreen extends ConsumerWidget {
  const ArtifactsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final artifacts = ref.watch(artifactsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Artifacts')),
      body: artifacts.when(
        data: (items) => items.isEmpty
            ? const EmptyState(
                icon: Icons.article_outlined,
                title: 'No artifacts',
                body:
                    'Save an AI response as an artifact to edit and version it.',
              )
            : ListView(
                children: items
                    .map(
                      (artifact) => ListTile(
                        leading: const Icon(Icons.article_outlined),
                        title: Text(artifact.title),
                        subtitle: Text(
                          '${artifact.type} • ${artifact.aiContactName}',
                        ),
                        trailing: artifact.archived
                            ? const Icon(Icons.archive_outlined)
                            : null,
                        onTap: () => context.push('/artifacts/${artifact.id}'),
                      ),
                    )
                    .toList(),
              ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class ArtifactWorkspaceScreen extends ConsumerStatefulWidget {
  const ArtifactWorkspaceScreen({required this.artifactId, super.key});
  final String artifactId;
  @override
  ConsumerState<ArtifactWorkspaceScreen> createState() =>
      _ArtifactWorkspaceScreenState();
}

class _ArtifactWorkspaceScreenState
    extends ConsumerState<ArtifactWorkspaceScreen> {
  final editor = TextEditingController();
  var loadedId = '';
  @override
  Widget build(BuildContext context) {
    final artifact = ref.watch(artifactProvider(widget.artifactId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Artifact'),
        actions: [
          IconButton(
            tooltip: 'Share',
            onPressed: () =>
                SharePlus.instance.share(ShareParams(text: editor.text)),
            icon: const Icon(Icons.ios_share),
          ),
        ],
      ),
      body: artifact.when(
        data: (item) {
          if (loadedId != item.id) {
            loadedId = item.id;
            editor.text = item.content;
          }
          return Column(
            children: [
              ListTile(
                title: Text(item.title),
                subtitle: Text('Version ${item.version} • ${item.type}'),
                trailing: IconButton(
                  tooltip: item.archived ? 'Restore' : 'Archive',
                  onPressed: () async {
                    await ref
                        .read(artifactsRepositoryProvider)
                        .setArchived(item.id, !item.archived);
                    ref.invalidate(artifactsProvider);
                    ref.invalidate(artifactProvider(item.id));
                  },
                  icon: Icon(
                    item.archived
                        ? Icons.unarchive_outlined
                        : Icons.archive_outlined,
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: TextField(
                    controller: editor,
                    expands: true,
                    minLines: null,
                    maxLines: null,
                    decoration: const InputDecoration(
                      labelText: 'Markdown-compatible content',
                    ),
                  ),
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton.icon(
                    onPressed: () async {
                      await ref
                          .read(artifactsRepositoryProvider)
                          .saveVersion(item.id, editor.text, item.version);
                      ref.invalidate(artifactProvider(item.id));
                    },
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Save new version'),
                  ),
                ),
              ),
            ],
          );
        },
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}
