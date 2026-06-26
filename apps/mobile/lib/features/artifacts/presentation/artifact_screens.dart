import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/theme/council_theme.dart';
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

class ArtifactsScreen extends ConsumerStatefulWidget {
  const ArtifactsScreen({super.key});

  @override
  ConsumerState<ArtifactsScreen> createState() => _ArtifactsScreenState();
}

class _ArtifactsScreenState extends ConsumerState<ArtifactsScreen> {
  final search = TextEditingController();
  var typeFilter = 'all';
  var includeArchived = false;

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final artifacts = ref.watch(artifactsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Artifacts')),
      body: artifacts.when(
        data: (items) {
          final query = search.text.trim().toLowerCase();
          final visible = items.where((artifact) {
            final matchesArchive = includeArchived || !artifact.archived;
            final matchesType =
                typeFilter == 'all' || artifact.type == typeFilter;
            final haystack =
                '${artifact.title} ${artifact.type} ${artifact.aiContactName}'
                    .toLowerCase();
            final matchesQuery = query.isEmpty || haystack.contains(query);
            return matchesArchive && matchesType && matchesQuery;
          }).toList();
          final types = {
            'all',
            for (final artifact in items) artifact.type,
          }.toList();
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(artifactsProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                CouncilPanel(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 2,
                  ),
                  child: SearchBar(
                    controller: search,
                    leading: const Icon(Icons.search),
                    hintText: 'Search artifacts',
                    elevation: const WidgetStatePropertyAll(0),
                    backgroundColor: const WidgetStatePropertyAll(
                      Colors.transparent,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final type in types)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(_label(type)),
                            selected: typeFilter == type,
                            onSelected: (_) =>
                                setState(() => typeFilter = type),
                          ),
                        ),
                      FilterChip(
                        label: const Text('Archived'),
                        avatar: const Icon(Icons.archive_outlined, size: 18),
                        selected: includeArchived,
                        onSelected: (value) =>
                            setState(() => includeArchived = value),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (visible.isEmpty)
                  const EmptyState(
                    icon: Icons.article_outlined,
                    title: 'No artifacts',
                    body:
                        'Save an AI response as an artifact to edit and version it.',
                  )
                else
                  CouncilSection(
                    title: 'Library',
                    subtitle: 'Saved AI workspaces with immutable versions.',
                    children: [
                      for (var index = 0; index < visible.length; index++)
                        FadeSlideIn(
                          delay: Duration(milliseconds: index * 20),
                          child: _ArtifactTile(artifact: visible[index]),
                        ),
                    ],
                  ),
              ],
            ),
          );
        },
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class _ArtifactTile extends StatelessWidget {
  const _ArtifactTile({required this.artifact});
  final Artifact artifact;

  @override
  Widget build(BuildContext context) => CouncilListTile(
    leading: DecoratedBox(
      decoration: BoxDecoration(
        color: context.councilColors.aiAccentSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Icon(
          Icons.article_outlined,
          color: context.councilColors.aiAccent,
        ),
      ),
    ),
    title: artifact.title,
    subtitle: '${_label(artifact.type)} by ${artifact.aiContactName}',
    trailing: Wrap(
      spacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        CouncilPill(label: 'v${artifact.version}'),
        if (artifact.archived)
          const CouncilPill(label: 'Archived', icon: Icons.archive_outlined),
        const Icon(Icons.chevron_right),
      ],
    ),
    onTap: () => context.push('/artifacts/${artifact.id}'),
  );
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
  var loadedVersion = 0;
  var savedText = '';
  var saving = false;

  bool get hasUnsavedChanges => editor.text != savedText;

  @override
  void dispose() {
    editor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final artifact = ref.watch(artifactProvider(widget.artifactId));
    return PopScope(
      canPop: !hasUnsavedChanges,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || !hasUnsavedChanges) return;
        final discard = await _confirmDiscard(context);
        if (discard && context.mounted) context.pop();
      },
      child: Scaffold(
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
            if (loadedId != item.id || loadedVersion != item.version) {
              loadedId = item.id;
              loadedVersion = item.version;
              savedText = item.content;
              editor.text = item.content;
            }
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                  child: CouncilPanel(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.title,
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w800),
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  CouncilPill(label: _label(item.type)),
                                  CouncilPill(label: 'Version ${item.version}'),
                                  if (item.archived)
                                    const CouncilPill(
                                      label: 'Archived',
                                      icon: Icons.archive_outlined,
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        IconButton.filledTonal(
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
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: CouncilPanel(
                      padding: EdgeInsets.zero,
                      child: TextField(
                        controller: editor,
                        expands: true,
                        minLines: null,
                        maxLines: null,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Markdown-compatible content',
                          alignLabelWithHint: true,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          contentPadding: EdgeInsets.all(16),
                        ),
                      ),
                    ),
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => SharePlus.instance.share(
                              ShareParams(text: savedText),
                            ),
                            icon: const Icon(Icons.description_outlined),
                            label: const Text('Export text'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: saving || !hasUnsavedChanges
                                ? null
                                : () => _save(item),
                            icon: saving
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.save_outlined),
                            label: const Text('Save version'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
          error: (e, _) => ErrorBanner(AppError.from(e).message),
          loading: () => const Center(child: CircularProgressIndicator()),
        ),
      ),
    );
  }

  Future<void> _save(Artifact item) async {
    setState(() => saving = true);
    try {
      await ref
          .read(artifactsRepositoryProvider)
          .saveVersion(item.id, editor.text, item.version);
      ref.invalidate(artifactProvider(item.id));
      ref.invalidate(artifactsProvider);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<bool> _confirmDiscard(BuildContext context) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Discard changes?'),
            content: const Text('Your unsaved artifact edits will be lost.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Keep editing'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Discard'),
              ),
            ],
          ),
        ) ??
        false;
  }
}

String _label(String value) {
  if (value.isEmpty) return value;
  return '${value.characters.first.toUpperCase()}${value.substring(1)}';
}
