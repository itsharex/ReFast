import React, { createContext, useContext, useReducer, ReactNode, Dispatch } from 'react';
import { AppInfo, FileHistoryItem, MemoItem, SearchResult } from '../types';

// 定义状态结构
interface LauncherState {
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  isLoading: boolean;
  apps: AppInfo[];
  fileHistory: FileHistoryItem[];
  memos: MemoItem[];
  // 可以根据需要添加更多状态
}

// 初始状态
const initialState: LauncherState = {
  query: '',
  results: [],
  selectedIndex: 0,
  isLoading: false,
  apps: [],
  fileHistory: [],
  memos: [],
};

// 定义 Action 类型
type LauncherAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'SET_RESULTS'; payload: SearchResult[] }
  | { type: 'SET_SELECTED_INDEX'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_APPS'; payload: AppInfo[] }
  | { type: 'MOVE_SELECTION'; payload: 'UP' | 'DOWN' };

// Reducer 函数
function launcherReducer(state: LauncherState, action: LauncherAction): LauncherState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload, selectedIndex: 0 }; // 重置选中项
    case 'SET_SELECTED_INDEX':
      return { ...state, selectedIndex: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_APPS':
      return { ...state, apps: action.payload };
    case 'MOVE_SELECTION':
      const direction = action.payload === 'UP' ? -1 : 1;
      const newIndex = Math.max(0, Math.min(state.results.length - 1, state.selectedIndex + direction));
      return { ...state, selectedIndex: newIndex };
    default:
      return state;
  }
}

// 创建 Context
const LauncherStateContext = createContext<LauncherState | undefined>(undefined);
const LauncherDispatchContext = createContext<Dispatch<LauncherAction> | undefined>(undefined);

// Provider 组件
export function LauncherProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(launcherReducer, initialState);

  return (
    <LauncherStateContext.Provider value={state}>
      <LauncherDispatchContext.Provider value={dispatch}>
        {children}
      </LauncherDispatchContext.Provider>
    </LauncherStateContext.Provider>
  );
}

// 自定义 Hook 方便使用
export function useLauncherState() {
  const context = useContext(LauncherStateContext);
  if (context === undefined) {
    throw new Error('useLauncherState must be used within a LauncherProvider');
  }
  return context;
}

export function useLauncherDispatch() {
  const context = useContext(LauncherDispatchContext);
  if (context === undefined) {
    throw new Error('useLauncherDispatch must be used within a LauncherProvider');
  }
  return context;
}
