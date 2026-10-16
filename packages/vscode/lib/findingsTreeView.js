"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingsTreeDataProvider = void 0;
const node_path_1 = __importDefault(require("node:path"));
const lastAnalysisState_1 = require("./lastAnalysisState");
const diagnostics_1 = require("./diagnostics");
const i18n_1 = require("./i18n");
class FindingsTreeDataProvider {
    vscode;
    emitter;
    sub;
    onDidChangeTreeData;
    constructor(vscode) {
        this.vscode = vscode;
        if (vscode.EventEmitter) {
            this.emitter = new vscode.EventEmitter();
            this.onDidChangeTreeData = this.emitter.event;
        }
        this.sub = (0, lastAnalysisState_1.onLastAnalysisChanged)(() => this.refresh());
    }
    refresh() {
        this.emitter?.fire();
    }
    dispose() {
        this.sub.dispose();
        this.emitter?.dispose();
    }
    getTreeItem(element) {
        const t = (0, i18n_1.translator)(this.vscode);
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
            const absPath = (0, diagnostics_1.resolveIssueFilePath)(repoPath, issue.filePath);
            const hasFlow = Boolean(issue.flow);
            const item = new this.vscode.TreeItem(`[${issue.type.toUpperCase()}] ${issue.category}`, hasFlow ? State.Collapsed : State.None);
            const lineSuffix = issue.lineNumber ? `:${issue.lineNumber}` : '';
            const testBadge = issue.inTest ? ' [Test]' : '';
            item.description = `${node_path_1.default.basename(issue.filePath)}${lineSuffix}${testBadge}`;
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
            const absPath = (0, diagnostics_1.resolveIssueFilePath)(repoPath, gc.filePath);
            const item = new this.vscode.TreeItem(`[${gc.rank.toUpperCase()}] ${gc.className}`, State.None);
            item.description = `Score ${gc.godScore} (${gc.lineCount}L, ${gc.methodCount}M) — ${node_path_1.default.basename(gc.filePath)}`;
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
    getChildren(element) {
        const t = (0, i18n_1.translator)(this.vscode);
        const last = (0, lastAnalysisState_1.getLastAnalysis)();
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
            const absPath = (0, diagnostics_1.resolveIssueFilePath)(element.repoPath, element.issue.filePath);
            const steps = [
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
exports.FindingsTreeDataProvider = FindingsTreeDataProvider;
module.exports = {
    FindingsTreeDataProvider,
};
