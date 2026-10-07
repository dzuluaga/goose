import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MessageProcessor,
  STRICT_VALIDATION,
  type ActionPayload,
  type ProcessableMessagePayload,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiMessage } from './a2uiPayload';
import { gooseCatalog } from './gooseCatalog';
import './a2uiTheme.css';

export type A2uiActionHandler = (action: ActionPayload) => void | Promise<void>;

type Processor = MessageProcessor<ReactComponentImplementation>;
type Surface = SurfaceModel<ReactComponentImplementation>;

type ProcessedSurfaces = { status: 'ready'; processor: Processor } | { status: 'failed' };

interface A2uiSurfacesProps {
  messages: readonly A2uiMessage[];
  /** Omit to render the surfaces read-only. */
  onAction?: A2uiActionHandler;
  /** Shown instead of the surfaces when the messages can't be processed or rendered. */
  fallback: ReactNode;
}

/**
 * Renders the surfaces described by one tool result's A2UI messages.
 *
 * Each instance owns its own processor, so surface ids from different tool
 * results can never collide.
 */
export function A2uiSurfaces({ messages, onAction, fallback }: A2uiSurfacesProps) {
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const processed = useMemo(
    () => processMessages(messages, (action) => onActionRef.current?.(action)),
    [messages]
  );

  if (processed.status === 'failed') {
    return <>{fallback}</>;
  }

  return (
    <SurfaceErrorBoundary fallback={fallback}>
      <ProcessorSurfaces processor={processed.processor} />
    </SurfaceErrorBoundary>
  );
}

function processMessages(
  messages: readonly A2uiMessage[],
  onAction: A2uiActionHandler
): ProcessedSurfaces {
  const processor: Processor = new MessageProcessor([gooseCatalog], onAction, {
    validationConfig: STRICT_VALIDATION,
  });
  try {
    // The processor validates every message against the v0.9 schemas and the catalog.
    processor.processMessages(messages as unknown as ProcessableMessagePayload);
    return { status: 'ready', processor };
  } catch {
    processor.dispose();
    return { status: 'failed' };
  }
}

function ProcessorSurfaces({ processor }: { processor: Processor }) {
  const [surfaces, setSurfaces] = useState<Surface[]>(() => [...processor.getSurfaces().values()]);

  useEffect(() => {
    const sync = () => setSurfaces([...processor.getSurfaces().values()]);
    sync();
    const created = processor.onSurfaceCreated(sync);
    const deleted = processor.onSurfaceDeleted(sync);
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);

  return (
    <div className="a2ui-surfaces flex flex-col gap-3">
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  );
}

class SurfaceErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
