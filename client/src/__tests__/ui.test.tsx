import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { notify, ToastViewport } from '@/components/ui/Toast';
import { renderWithProviders } from './testUtils';

vi.mock('sonner', () => ({
  Toaster: ({ position }: { position?: string }) => <div data-testid="toaster">{position}</div>,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('UI kit', () => {
  it('renders sprite icons through branding.svg', () => {
    renderWithProviders(<Icon name="search" title="Search" />);

    const icon = screen.getByRole('img', { name: 'Search' });
    expect(icon).toBeInTheDocument();
    expect(icon.querySelector('use')).toHaveAttribute(
      'href',
      '/branding.svg#ico-search',
    );
  });

  it('hides decorative icons from assistive tech', () => {
    renderWithProviders(<Icon name="lock" />);

    expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a button and handles clicks', async () => {
    const onClick = vi.fn();
    renderWithProviders(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps loading buttons disabled with visible status', () => {
    renderWithProviders(<Button isLoading>Save</Button>);

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders card title, description and content', () => {
    renderWithProviders(
      <Card title="Scenario" description="Draft">
        Body
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Scenario' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('can render a clickable card surface', () => {
    const onClick = vi.fn();
    renderWithProviders(<Card title="Open" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders badge variants as status labels', () => {
    renderWithProviders(<Badge variant="success">Published</Badge>);

    expect(screen.getByText('Published')).toHaveClass('bg-success/10');
  });

  it('supports neutral badges for inactive states', () => {
    renderWithProviders(<Badge variant="neutral">Draft</Badge>);

    expect(screen.getByText('Draft')).toHaveClass('text-fg-muted');
  });

  it('renders inputs with an associated label', () => {
    renderWithProviders(<Input label="Username" name="username" />);

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('announces invalid input messages', () => {
    renderWithProviders(<Input label="Password" name="password" error="Required" />);

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toHaveAttribute('role', 'alert');
  });

  it('opens a modal, locks scroll and closes on Escape', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open title="Session" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard focus inside modal controls', async () => {
    renderWithProviders(
      <Modal open title="Session" onClose={vi.fn()}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>,
    );

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('focuses cancel in confirm dialogs by default', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete"
        description="Are you sure?"
        confirmLabel="Delete"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('calls confirm action from confirm dialogs', async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete"
        description="Are you sure?"
        confirmLabel="Delete"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders empty states with a navigation action', () => {
    renderWithProviders(
      <EmptyState
        icon="cases"
        title="No cases"
        description="Assigned cases will appear here."
        action={{ label: 'Open cases', href: '/student/cases' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No cases' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open cases' })).toHaveAttribute(
      'href',
      '/student/cases',
    );
  });

  it('supports button actions in empty states', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <EmptyState icon="cases" title="No cases" action={{ label: 'Refresh', onClick }} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading spinner status text', () => {
    renderWithProviders(<LoadingSpinner label="Loading users" />);

    expect(screen.getByRole('status', { name: 'Loading users' })).toBeInTheDocument();
  });

  it('renders skeleton placeholders with an accessible label', () => {
    renderWithProviders(<Skeleton rows={3} label="Loading table" />);

    expect(screen.getByRole('status', { name: 'Loading table' })).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });

  it('renders tables with headers and rows', () => {
    renderWithProviders(
      <Table
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ]}
        data={[{ id: 1, name: 'Ivan', role: 'student' }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /ivan student/i })).getByText('student')).toBeInTheDocument();
  });

  it('renders table empty state', () => {
    renderWithProviders(
      <Table
        columns={[{ key: 'name', header: 'Name' }]}
        data={[]}
        getRowKey={(row: { id: number }) => row.id}
        emptyMessage="No users"
      />,
    );

    expect(screen.getByText('No users')).toBeInTheDocument();
  });

  it('renders table loading state', () => {
    renderWithProviders(
      <Table
        columns={[{ key: 'name', header: 'Name' }]}
        data={[]}
        getRowKey={(row: { id: number }) => row.id}
        isLoading
      />,
    );

    expect(screen.getByRole('status', { name: 'Loading table' })).toBeInTheDocument();
  });

  it('renders table error state', () => {
    renderWithProviders(
      <Table
        columns={[{ key: 'name', header: 'Name' }]}
        data={[]}
        getRowKey={(row: { id: number }) => row.id}
        error="Unable to load"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load');
  });

  it('mounts toast viewport and forwards notifications', async () => {
    const sonner = await import('sonner');
    renderWithProviders(<ToastViewport />);

    notify.success('Saved');

    expect(screen.getByTestId('toaster')).toHaveTextContent('bottom-right');
    expect(sonner.toast.success).toHaveBeenCalledWith('Saved');
  });
});
