import { MarkdownEditorWindow } from "./components/MarkdownEditorWindow";
import "./styles.css";

function MarkdownEditorApp() {
  return (
    <div 
      className="h-screen w-screen" 
      style={{ 
        backgroundColor: '#f9fafb', 
        margin: 0, 
        padding: 0,
        height: '100vh',
        width: '100vw',
      }}
    >
      <MarkdownEditorWindow />
    </div>
  );
}

export default MarkdownEditorApp;

