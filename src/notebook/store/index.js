import { createStore, applyMiddleware } from 'redux';
import { reduxObservable } from 'redux-observable';
import { triggerUndo } from '../middlewares';
import rootReducer from '../reducers';

export default function configureStore(initialState) {
  return createStore(
    rootReducer,
    initialState,
    applyMiddleware(reduxObservable(), triggerUndo)
  );
}
