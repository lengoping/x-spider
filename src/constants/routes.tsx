import { Route } from '../interfaces/Route';
import {
  HomeFilled,
  SettingFilled,
  DownloadOutlined,
  InfoCircleFilled,
  ThunderboltOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { Homepage } from '../pages/Homepage';
import { DownloadManagement } from '../pages/DownloadManagement';
import { Settings } from '../pages/Settings';
import { About } from '../pages/About';
import { Automation } from '../pages/Automation';
import { TweetManager } from '../pages/TweetManager';

export const ROUTES: Route[] = [
  {
    id: 'home',
    name: '主页',
    icon: <HomeFilled />,
    element: <Homepage />,
  },
  {
    id: 'download-management',
    name: '下载管理',
    icon: <DownloadOutlined />,
    element: <DownloadManagement />,
  },
  {
    id: 'automation',
    name: '自动化',
    icon: <ThunderboltOutlined />,
    element: <Automation />,
  },
  {
    id: 'tweet-manager',
    name: '推文库',
    icon: <DatabaseOutlined />,
    element: <TweetManager />,
  },
  {
    id: 'settings',
    name: '设置',
    icon: <SettingFilled />,
    element: <Settings />,
  },
  {
    id: 'about',
    name: '关于',
    icon: <InfoCircleFilled />,
    element: <About />,
  },
];
