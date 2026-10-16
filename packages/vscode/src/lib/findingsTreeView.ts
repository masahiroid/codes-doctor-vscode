import path from 'node:path';
import type * as vscodeTypes from 'vscode';
import { getLastAnalysis, onLastAnalysisChanged } from './lastAnalysisState';
import { resolveIssueFilePath } from './diagnostics';
import { translator } from './i18n';
import type { AnalysisResult } from './engine';

type SecurityIssue = NonNullable<AnalysisResult['securityScore']>['issues'][number];
type GodClassResult = AnalysisResult['godClasses'][number];
type CircularDependency = AnalysisResult['circularDependencies'][number];

export type FindingNode =
  | { kind: 'empty' }
  | { kind: 'category'; id: 'security' | 'godClasses' | 'circularDeps'; label: string; count: number }
  | { kind: 'security'; issue: SecurityIssue; repoPath: string }
  | { kind: 'flowStep'; label: string; description: string; filePath: string; line: number }
  | { kind: 'godClass'; godClass: GodClassResult; repoPath: string }
  | { kind: 'circularDep'; dep: CircularDependency };

export class FindingsTreeDataProvider implements vscodeTypes.TreeDataProvider<FindingNode> {
  private vscode: typeof import('vscode');
  private emitter: vscodeTypes.EventEmitter<FindingNode | undefined | null | void> | undefined;
  private sub: { dispose(): void };
  readonly onDidChangeTreeData: vscodeTypes.Event<FindingNode | undefined | null | void> | undefined;

  constructor(vscode: typeof import('vscode')) {
    this.vscode = vscode;
    if (vscode.EventEmitter) {
      this.emitter = new vscode.EventEmitter<FindingNode | undefined | null | void>();
      this.onDidChangeTreeData = this.emitter.event;
    }
    this.sub = onLastAnalysisChanged(() => this.refresh());
  }

  refresh() {
    this.emitter?.fire();
  }

  dispose() {
    this.sub.dispose();
    this.emitter?.dispose();
  }

  getTreeItem(element: FindingNode): import('vscode').TreeItem {
    const t = translator(this.vscode);
    const State = this.vscode.TreeItemCollapsibleState || { None: 0, Collapsed: 1, Expanded: 2 };

    if (element.kind === 'empty') {
      const item = new this.vscode.TreeItem(t('Run "Analyze Current Workspace" to see findings'), State.None);
      item.command = {
        command: 'codeDoctor.analyzeCurrentWorkspace',
        title: t('Analyze Current Workspace'),
      };
      return item;
    }

    if (element.kind === 'category') {
      const state = element.count > 0 ? State.Expanded : State.None;
      const item = new this.vscode.TreeItem(`${element.label} (${element.count})`, state);
      return item;
    }

    if (element.kind === 'security') {
      const { issue, repoPath } = element;
      const absPath = resolveIssueFilePath(repoPath, issue.filePath);
      const hasFlow = Boolean(issue.flow);
      const item = new this.vscode.TreeItem(
        `[${issue.type.toUpperCase()}] ${issue.category}`,
        hasFlow ? State.Collapsed : State.None
      );
      const lineSuffix = issue.lineNumber ? `:${issue.lineNumber}` : '';
      const testBadge = issue.inTest ? ' [Test]' : '';
      item.description = `${path.basename(issue.filePath)}${lineSuffix}${testBadge}`;
      item.tooltip = `${issue.description}\n\n${t('Recommendation')}: ${issue.recommendation}`;
      item.command = {
        command: 'codeDoctor.openFindingLocation',
        title: t('Open Finding Location'),
        arguments: [absPath, issue.lineNumber || 1],
      };
      return item;
    }

    if (element.kind === 'flowStep') {
      const item = new this.vscode.TreeItem(element.label, State.None);
      item.description = element.description;
      item.command = {
        command: 'codeDoctor.openFindingLocation',
        title: t('Open Finding Location'),
        arguments: [element.filePath, element.line],
      };
      return item;
    }

    if (element.kind === 'godClass') {
      const { godClass: gc, repoPath } = element;
      const absPath = resolveIssueFilePath(repoPath, gc.filePath);
      const item = new this.vscode.TreeItem(`[${gc.rank.toUpperCase()}] ${gc.className}`, State.None);
      item.description = `Score ${gc.godScore} (${gc.lineCount}L, ${gc.methodCount}M) — ${path.basename(gc.filePath)}`;
      item.tooltip = `${absPath}\n${(gc.warnings || []).join('\n')}`;
      item.command = {
        command: 'codeDoctor.openFindingLocation',
        title: t('Open Finding Location'),
        arguments: [absPath, 1],
      };
      return item;
    }

    const item = new this.vscode.TreeItem(element.dep.cycle.join(' → '), State.None);
    item.description = `${element.dep.length} modules`;
    item.tooltip = element.dep.cycle.join(' → ');
    return item;
  }

  getChildren(element?: FindingNode): FindingNode[] {
    const t = translator(this.vscode);
    const last = getLastAnalysis();
    const result = last?.result;
    if (!result) {
      return element ? [] : [{ kind: 'empty' }];
    }

    const securityIssues = (result.securityScore?.issues || []).filter((i) => i.type !== 'info');
    const godClasses = (result.godClasses || []).filter((g) => g.rank === 'critical' || g.rank === 'high' || g.rank === 'medium');
    const circularDeps = result.circularDependencies || [];

    if (!element) {
      return [
        { kind: 'category', id: 'security', label: t('Security Issues'), count: securityIssues.length },
        { kind: 'category', id: 'godClasses', label: t('God Classes'), count: godClasses.length },
        { kind: 'category', id: 'circularDeps', label: t('Circular Dependencies'), count: circularDeps.length },
      ];
    }

    if (element.kind === 'category') {
      if (element.id === 'security') {
        return securityIssues.map((issue) => ({ kind: 'security', issue, repoPath: result.repoPath }));
      }
      if (element.id === 'godClasses') {
        return godClasses.map((godClass) => ({ kind: 'godClass', godClass, repoPath: result.repoPath }));
      }
      if (element.id === 'circularDeps') {
        return circularDeps.map((dep) => ({ kind: 'circularDep', dep }));
      }
    }

    if (element.kind === 'security' && element.issue.flow) {
      const { flow } = element.issue;
      const absPath = resolveIssueFilePath(element.repoPath, element.issue.filePath);
      const steps: FindingNode[] = [
        {
          kind: 'flowStep',
          label: `${t('Source')} (L${flow.source.line})`,
          description: flow.source.code.trim(),
          filePath: absPath,
          line: flow.source.line,
        },
      ];
      for (const step of flow.steps || []) {
        steps.push({
          kind: 'flowStep',
          label: `${t('Via')} (L${step.line})`,
          description: step.code.trim(),
          filePath: absPath,
          line: step.line,
        });
      }
      steps.push({
        kind: 'flowStep',
        label: `${t('Sink')} (L${flow.sink.line})`,
        description: flow.sink.code.trim(),
        filePath: absPath,
        line: flow.sink.line,
      });
      return steps;
    }

    return [];
  }
}

module.exports = {
  FindingsTreeDataProvider,
};
