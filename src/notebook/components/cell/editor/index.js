import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';

import CodeMirror from 'react-codemirror';
import CM from 'codemirror';

import Rx from 'rxjs/Rx';

import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/anyword-hint';

import { codeComplete, pick, formChangeObject } from './complete';

import { updateCellSource } from '../../../actions';

function goLineUpOrEmit(editor) {
  const cursor = editor.getCursor();
  if (cursor.line === 0 && cursor.ch === 0 && !editor.somethingSelected()) {
    CM.signal(editor, 'topBoundary');
  } else {
    editor.execCommand('goLineUp');
  }
}

function goLineDownOrEmit(editor) {
  const cursor = editor.getCursor();
  const lastLineNumber = editor.lastLine();
  const lastLine = editor.getLine(lastLineNumber);
  if (cursor.line === lastLineNumber &&
      cursor.ch === lastLine.length &&
      !editor.somethingSelected()) {
    CM.signal(editor, 'bottomBoundary');
  } else {
    editor.execCommand('goLineDown');
  }
}

CM.keyMap.basic.Up = 'goLineUpOrEmit';
CM.keyMap.basic.Down = 'goLineDownOrEmit';
CM.commands.goLineUpOrEmit = goLineUpOrEmit;
CM.commands.goLineDownOrEmit = goLineDownOrEmit;

export default class Editor extends React.Component {
  static propTypes = {
    id: React.PropTypes.string,
    input: React.PropTypes.any,
    completion: React.PropTypes.bool,
    language: React.PropTypes.string,
    lineNumbers: React.PropTypes.bool,
    lineWrapping: React.PropTypes.bool,
    onChange: React.PropTypes.func,
    theme: React.PropTypes.string,
    cmtheme: React.PropTypes.string,
    focused: React.PropTypes.bool,
    focusAbove: React.PropTypes.func,
    focusBelow: React.PropTypes.func,
  };

  static contextTypes = {
    store: React.PropTypes.object,
  };

  static defaultProps = {
    language: 'python',
    lineNumbers: false,
    cmtheme: 'composition',
    focused: false,
  };

  constructor(props) {
    super(props);
    this.shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate.bind(this);
    this.state = {
      source: this.props.input,
    };
    this.onChange = this.onChange.bind(this);

    this.hint = this.completions.bind(this);
    this.hint.async = true;

    // Remember the name of the theme that's applied so that when it changes we
    // can force codemirror to remeasure.
    this.theme = null;
  }

  componentDidMount() {
    // On first load, if focused, set codemirror to focus
    if (this.props.focused) {
      this.refs.codemirror.focus();
    }

    const cm = this.refs.codemirror.getCodeMirror();
    cm.on('topBoundary', this.props.focusAbove);
    cm.on('bottomBoundary', this.props.focusBelow);

    const inputEvents = Rx.Observable.fromEvent(cm,
      'change', formChangeObject)
      .filter(x => x.change.origin === '+input');

    // TODO: The subscription created here needs to be cleaned up when the cell
    //       is deleted
    //       Suggestion: trigger off of a codemirror event
    inputEvents
      .switchMap(i => Rx.Observable.of(i)) // Not sure how to do this without identity function
      // Pass through changes that aren't newlines
      .filter(event => event.change.text.length === 1 ||
                       (event.change.text.length === 2 &&
                       !(event.change.text[0] === '' && event.change.text[1] === ''))
      )
      // Pass through only partial tokens that are composed of words
      .filter((event) => {
        const editor = event.cm;
        const tokenRange = editor.findWordAt(editor.getCursor());
        const token = editor.getRange(tokenRange.anchor, tokenRange.head);
        return /(\w|\.)/.test(token);
      })
      .subscribe(event => {
        if (!event.cm.state.completionActive && store.getState().app.executionState === 'idle') {
          event.cm.execCommand('autocomplete');
        }
      }, error => {
        console.error(error);
      });
  }

  componentWillReceiveProps(nextProps) {
    this.setState({
      source: nextProps.input,
    });
  }

  componentDidUpdate(prevProps) {
    if (this.props.focused && prevProps.focused !== this.props.focused) {
      this.refs.codemirror.focus();
    } else if (!this.props.focused && prevProps.focused !== this.props.focused) {
      const cm = this.refs.codemirror.getCodeMirror();
      cm.getInputField().blur();
    }

    if (this.theme !== this.props.theme) {
      this.theme = this.props.theme;
      this.refs.codemirror.getCodeMirror().refresh();
    }
  }

  onChange(text) {
    if (this.props.onChange) {
      this.props.onChange(text);
    } else {
      this.setState({
        source: text,
      });
      this.context.store.dispatch(updateCellSource(this.props.id, text));
    }
  }

  completions(editor, callback) {
    if (!this.props.completion) {
      return;
    }

    const state = this.context.store.getState();
    const channels = state.app.channels;

    codeComplete(channels, editor)
      .subscribe(callback);
  }

  render() {
    const options = {
      mode: this.props.language,
      lineNumbers: this.props.lineNumbers,
      lineWrapping: this.props.lineWrapping,
      theme: this.props.cmtheme,
      autofocus: false,
      hintOptions: {
        hint: this.hint,
        completeSingle: false, // In automatic autocomplete mode we don't want override
        extraKeys: {
          Right: pick,
        },
      },
      extraKeys: {
        'Ctrl-Space': 'autocomplete',
      },
    };
    return (
      <div className="input">
        <CodeMirror
          value={this.state.source}
          ref="codemirror"
          className="cell_cm"
          options={options}
          onChange={this.onChange}
        />
      </div>
    );
  }
}
