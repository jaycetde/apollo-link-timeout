import TimeoutLink from '../src/timeoutLink';
import { ApolloLink, execute, Observable } from '@apollo/client/core';
import gql from 'graphql-tag';

const TEST_TIMEOUT = 100;

const timeoutLink: TimeoutLink = new TimeoutLink(TEST_TIMEOUT);

const query = gql`
  {
    foo {
      bar
    }
  }
`;

let called, delay;

const mockLink = new ApolloLink(operation => {
  const context = operation.getContext();
  const abortController: AbortController | undefined =
    context.fetchOptions && context.fetchOptions.controller;
  called++;
  return new Observable(observer => {
    const timer = setTimeout(() => {
      observer.next({});
      observer.complete();
    }, delay);

    if (abortController) {
      const onAbort = () => {
        clearTimeout(timer);
        observer.error(new Error('Aborted'));
        observer.complete();
      };
      abortController.signal.addEventListener('abort', onAbort);
      if (abortController.signal.aborted) {
        onAbort();
      }
    }
  });
});

const link = timeoutLink.concat(mockLink);

beforeEach(() => {
  called = 0;
});

test('short request does not timeout', done => {
  delay = 50;

  execute(link, { query }).subscribe({
    next() {
      expect(called).toBe(1);
      done();
    },
    error() {
      expect('error called').toBeFalsy();
      done();
    }
  });
});

test('long request times out', done => {
  delay = 200;

  execute(link, { query }).subscribe({
    next() {
      expect('next called').toBeFalsy();
      done();
    },
    error(error) {
      expect(error.message).toEqual('Timeout exceeded');
      expect(error.timeout).toEqual(100);
      expect(error.statusCode).toEqual(408);
      done();
    }
  });
});

test('configured value through context does not time out', done => {
  delay = 200;
  const configured = 500;

  execute(link, { query, context: { timeout: configured } }).subscribe({
    next() {
      expect(called).toBe(1);
      done();
    },
    error(error) {
      expect('error called').toBeFalsy();
      done();
    }
  });
});

test('configured short value through context time out', done => {
  delay = 200;
  const configured = 100;

  execute(link, { query, context: { timeout: configured } }).subscribe({
    next() {
      expect('next called').toBeFalsy();
      done();
    },
    error(error) {
      expect(error.message).toEqual('Timeout exceeded');
      expect(error.timeout).toEqual(configured);
      expect(error.statusCode).toEqual(408);
      done();
    }
  });
});

test('aborted request does not timeout', done => {
  delay = 200;
  const configured = 100;

  const controller = new AbortController();
  const fetchOptions = { controller, signal: controller.signal };

  controller.abort();

  execute(link, {
    query,
    context: { fetchOptions, timeout: configured }
  }).subscribe({
    error(err) {
      expect(called).toBe(1);
      expect(err).toEqual(new Error('Aborted'));
      done();
    }
  });
});
